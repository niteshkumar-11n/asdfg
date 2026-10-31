import tempfile
import unittest
from pathlib import Path
from backend.app.main import create_app
from backend.app.synthetic import make_data
from backend.app.ingest import publish

class ApiTests(unittest.TestCase):
    def test_read_only_routes_static_page_etag_and_missing_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); data=root/"data"; static=root/"static"; static.mkdir(); (static/"index.html").write_text("WindDesk")
            out,fc=make_data(); publish(out,fc,data,"synthetic")
            client=create_app(data,static).test_client()
            page=client.get("/")
            self.assertEqual(page.status_code,200)
            page.close()
            response=client.get("/api/meta")
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json["coverage"]["expected_outturn_stored"],1536)
            self.assertEqual(response.json["coverage"]["expected_delivery_actuals"],1488)
            self.assertEqual(client.get("/api/meta",headers={"If-None-Match":response.headers["ETag"]}).status_code,304)
            custom=client.get("/api/decision?decision_date=2026-01-15&cutoff=12%3A34&publication_lag_min=10&band=rolling")
            self.assertEqual(custom.status_code,200)
            self.assertEqual(custom.json["cutoff_uk"],"12:34")
            self.assertEqual(custom.json["publication_lag_min"],10)
            post=client.post("/api/meta")
            self.assertEqual(post.status_code,405)
            self.assertEqual(post.json["code"],"method_not_allowed")
            self.assertEqual(client.get("/api/health").json["status"],"ok")
    def test_cutoff_lag_and_date_validation_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); out,fc=make_data(); publish(out,fc,root,"synthetic")
            client=create_app(root,Path(tmp)/"static").test_client()
            self.assertEqual(client.get("/api/decision?cutoff=25%3A00").status_code,400)
            self.assertEqual(client.get("/api/decision?publication_lag_min=721").status_code,400)
            self.assertEqual(client.get("/api/decision?decision_date=2026-02-01").status_code,400)
    def test_torn_snapshot_returns_updating_not_bad_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); out,fc=make_data(); publish(out,fc,root,"synthetic")
            (root/"windfor.csv.gz").write_bytes(b"partial replacement")
            response=create_app(root,Path(tmp)/"static").test_client().get("/api/meta")
            self.assertEqual(response.status_code,503)
            self.assertEqual(response.json["code"],"updating")
    def test_missing_snapshot_is_service_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            client=create_app(Path(tmp)/"data",Path(tmp)/"static").test_client()
            response=client.get("/api/meta")
            self.assertEqual(response.status_code,503)
            self.assertEqual(response.json["code"],"no_data")
    def test_cors_and_options_preflight(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); out,fc=make_data(); publish(out,fc,root,"synthetic")
            client=create_app(root,Path(tmp)/"static").test_client()
            opt=client.open("/api/meta",method="OPTIONS",headers={"Origin":"https://winddesk.vercel.app"})
            self.assertEqual(opt.status_code,200)
            self.assertEqual(opt.headers.get("Access-Control-Allow-Origin"),"*")
            self.assertIn("GET",opt.headers.get("Access-Control-Allow-Methods",""))
            res=client.get("/api/health",headers={"Origin":"https://winddesk.vercel.app"})
            self.assertEqual(res.status_code,200)
            self.assertEqual(res.headers.get("Access-Control-Allow-Origin"),"*")
            root_fallback=client.get("/")
            self.assertEqual(root_fallback.status_code,200)
            self.assertEqual(root_fallback.json["status"],"ok")


if __name__=="__main__": unittest.main()
