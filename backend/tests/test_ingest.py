import gzip, tempfile, unittest
from pathlib import Path
import pandas as pd
from unittest.mock import patch
from backend.app.ingest import canonical_gzip, publish, request_json, normalise, acquire_lock, release_lock
from backend.app.data import load_snapshot

class IngestTests(unittest.TestCase):
    def test_canonical_bytes_repeat(self):
        frame=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[3.14159]})
        self.assertEqual(canonical_gzip(frame,["start_time","actual_mw"],["start_time"]),canonical_gzip(frame,["start_time","actual_mw"],["start_time"]))
    def test_publish_is_noop_and_snapshot_verifies(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[5.]})
            fc=pd.DataFrame(columns=["publish_time","start_time","forecast_mw"])
            self.assertEqual(publish(out,fc,Path(tmp),"synthetic"),"written")
            before={p.name:p.stat().st_mtime_ns for p in Path(tmp).iterdir() if p.is_file()}
            self.assertEqual(publish(out,fc,Path(tmp),"synthetic"),"up to date")
            after={p.name:p.stat().st_mtime_ns for p in Path(tmp).iterdir() if p.is_file()}
            self.assertEqual(before,after)
            self.assertEqual(load_snapshot(tmp,force=True)["meta"]["source"],"synthetic")
    def test_chunk_responses_are_cached_by_request(self):
        class Response:
            status_code=200
            def raise_for_status(self): pass
            def json(self): return {"data":[{"value":1}]}
        class Session:
            calls=0
            def get(self,*args,**kwargs): self.calls+=1; return Response()
        with tempfile.TemporaryDirectory() as tmp:
            session=Session(); cache=Path(tmp)
            self.assertEqual(request_json(session,"/dataset",{"from":"2026-01-01"},cache),[{"value":1}])
            self.assertEqual(request_json(session,"/dataset",{"from":"2026-01-01"},cache),[{"value":1}])
            self.assertEqual(session.calls,1)
            request_json(session,"/dataset",{"from":"2026-01-01"},cache,refresh=True)
            self.assertEqual(session.calls,2)
    def test_corrupt_snapshot_is_repaired_from_new_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); fc=pd.DataFrame(columns=["publish_time","start_time","forecast_mw"])
            first=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[5.]})
            publish(first,fc,root,"synthetic")
            (root/"fuelhh_wind.csv.gz").write_bytes(b"corrupt")
            second=pd.DataFrame({"start_time":["2026-01-01T00:30:00Z"],"actual_mw":[6.]})
            self.assertEqual(publish(second,fc,root,"synthetic"),"written")
            loaded=load_snapshot(root,force=True)
            self.assertEqual(loaded["out"].start_time.dt.minute.tolist(),[30])
    def test_source_switch_requires_explicit_replace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); out=pd.DataFrame(columns=["start_time","actual_mw"]); fc=pd.DataFrame(columns=["publish_time","start_time","forecast_mw"])
            publish(out,fc,root,"synthetic")
            with self.assertRaises(ValueError): publish(out,fc,root,"elexon")
            self.assertEqual(publish(out,fc,root,"elexon",replace_existing=True),"written")
            self.assertEqual(load_snapshot(root,force=True)["meta"]["source"],"elexon")
    def test_stale_lock_takeover_has_one_owner_and_old_owner_cannot_release_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            lock=Path(tmp)/".ingest.lock"; lock.write_text("old owner")
            import os, time
            os.utime(lock,(time.time()-3600,time.time()-3600))
            new_owner=acquire_lock(lock,stale_s=30)
            self.assertTrue(new_owner)
            self.assertIsNone(acquire_lock(lock,stale_s=30))
            release_lock(lock,"old owner")
            self.assertEqual(lock.read_text(),new_owner)
            release_lock(lock,new_owner)
            self.assertFalse(lock.exists())
    def test_fresh_writer_lock_skips_without_touching_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); lock=root/".ingest.lock"; owner=acquire_lock(lock)
            out=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[5.]})
            fc=pd.DataFrame(columns=["publish_time","start_time","forecast_mw"])
            self.assertEqual(publish(out,fc,root,"synthetic"),"skipped")
            self.assertFalse((root/"meta.json").exists())
            release_lock(lock,owner)
    def test_republished_natural_key_replaces_old_value(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); fc=pd.DataFrame(columns=["publish_time","start_time","forecast_mw"])
            first=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[5.]})
            replacement=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[9.]})
            publish(first,fc,root,"synthetic"); publish(replacement,fc,root,"synthetic")
            stored=load_snapshot(root,force=True)["out"]
            self.assertEqual(len(stored),1)
            self.assertEqual(float(stored.actual_mw.iloc[0]),9.)
    def test_snapshot_commit_marker_is_written_last(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); out=pd.DataFrame({"start_time":["2026-01-01T00:00:00Z"],"actual_mw":[5.]})
            fc=pd.DataFrame(columns=["publish_time","start_time","forecast_mw"]); order=[]
            from backend.app import ingest
            original=ingest.atomic_write
            def record(path,data):
                order.append(Path(path).name)
                original(path,data)
            with patch("backend.app.ingest.atomic_write",side_effect=record): publish(out,fc,root,"synthetic")
            self.assertEqual(order,["fuelhh_wind.csv.gz","windfor.csv.gz","meta.json"])
    def test_normalise_filters_fuel_and_uses_latest_actual_publication(self):
        raw=[{"fuelType":"WIND","startTime":"2026-01-01T00:00Z","publishTime":"2026-01-01T01:00Z","generation":10},{"fuelType":"WIND","startTime":"2026-01-01T00:00Z","publishTime":"2026-01-01T02:00Z","generation":12},{"fuelType":"SOLAR","startTime":"2026-01-01T00:30Z","generation":99},{"fuelType":"WIND","startTime":"2026-01-01T01:00Z","generation":-1}]
        out,fc,qa=normalise(raw,[])
        self.assertEqual(out.actual_mw.tolist(),[12])
        self.assertEqual(qa["wrong_fuel"],1)
        self.assertEqual(qa["invalid_value"],1)
        self.assertEqual(qa["duplicates"],1)

if __name__=="__main__": unittest.main()
