import unittest
import pandas as pd
from datetime import date, timedelta
from backend.app.analytics import select_latest, select_previous, metrics, evaluation, persistence, band
from backend.app.config import cutoff_instant
from backend.app.synthetic import make_data

class AnalyticsTests(unittest.TestCase):
    def test_cutoff_uses_latest_vintage_and_excludes_future(self):
        fc=pd.DataFrame({"publish_time":pd.to_datetime(["2026-01-15T08:00Z","2026-01-15T09:20Z","2026-01-15T09:21Z"],utc=True),"start_time":pd.to_datetime(["2026-01-16T00:00Z"]*3,utc=True),"forecast_mw":[1,2,3]})
        selected=select_latest(fc,date(2026,1,15),"09:20")
        self.assertEqual(selected.forecast_mw.tolist(),[2])
    def test_publication_lag_moves_the_eligible_cutoff_back(self):
        fc=pd.DataFrame({"publish_time":pd.to_datetime(["2026-01-15T08:40Z","2026-01-15T09:15Z"],utc=True),"start_time":pd.to_datetime(["2026-01-16T00:00Z"]*2,utc=True),"forecast_mw":[1,2]})
        self.assertEqual(select_latest(fc,date(2026,1,15),"09:20").forecast_mw.tolist(),[2])
        self.assertEqual(select_latest(fc,date(2026,1,15),"09:20",10).forecast_mw.tolist(),[1])
    def test_previous_vintage_is_selected_per_delivery_period(self):
        fc=pd.DataFrame({"publish_time":pd.to_datetime(["2026-01-15T08:00Z","2026-01-15T09:00Z","2026-01-15T08:00Z"],utc=True),"start_time":pd.to_datetime(["2026-01-16T00:00Z","2026-01-16T00:00Z","2026-01-16T00:30Z"],utc=True),"forecast_mw":[10,20,30]})
        previous=select_previous(fc,date(2026,1,15),"09:20")
        self.assertEqual(previous.forecast_mw.tolist(),[10])
    def test_rolling_band_excludes_target_and_future_delivery_days(self):
        starts=pd.to_datetime(["2026-01-16T00:00Z","2026-01-17T00:00Z","2026-01-18T00:00Z"],utc=True)
        fc=pd.DataFrame({"publish_time":pd.to_datetime(["2026-01-15T00:00Z","2026-01-16T00:00Z","2026-01-17T00:00Z"],utc=True),"start_time":starts,"forecast_mw":[90,90,0]})
        out=pd.DataFrame({"start_time":starts,"actual_mw":[100,100,100]})
        result=band(fc,out,"rolling",date(2026,1,18))
        self.assertEqual(int(result.n_band.sum()),2)
    def test_band_calibration_excludes_backfilled_periods(self):
        fc=pd.DataFrame({"publish_time":pd.to_datetime(["2026-01-15T00:00Z","2026-01-17T00:00Z"],utc=True),"start_time":pd.to_datetime(["2026-01-16T00:00Z","2026-01-16T00:00Z"],utc=True),"forecast_mw":[90,0]})
        out=pd.DataFrame({"start_time":pd.to_datetime(["2026-01-16T00:00Z"],utc=True),"actual_mw":[100]})
        result=band(fc,out)
        self.assertEqual(int(result.n_band.sum()),1)
        self.assertEqual(float(result.p90_error_mw.iloc[0]),10.)
    def test_metrics_follow_actual_minus_forecast(self):
        frame=pd.DataFrame({"actual_mw":[10,20],"forecast_mw":[12,16],"persistence_mw":[15,15]})
        result=metrics(frame)
        self.assertEqual(result["mae_mw"],3)
        self.assertEqual(result["bias_mw"],1)
        self.assertAlmostEqual(result["wmape"],.2)
    def test_evaluation_keeps_half_hours_without_a_forecast(self):
        times=pd.date_range("2026-01-16T00:00Z",periods=4,freq="30min")
        out=pd.DataFrame({"start_time":times,"actual_mw":[10,11,12,13]})
        fc=pd.DataFrame({"publish_time":pd.to_datetime(["2026-01-15T08:00Z"]*2,utc=True),"start_time":times[[0,2]],"forecast_mw":[9,10]})
        result=evaluation(out,fc,"09:20",date(2026,1,15))
        self.assertEqual(len(result),4)
        self.assertEqual(int(result.forecast_mw.isna().sum()),2)
    def test_cutoff_sweep_never_selects_future_or_wrong_delivery_rows(self):
        _,fc=make_data()
        for column in ("publish_time","start_time"): fc[column]=pd.to_datetime(fc[column],utc=True)
        for offset in range(31):
            day=date(2026,1,1)+timedelta(days=offset)
            for cutoff in ("09:20","09:50","15:30"):
                selected=select_latest(fc,day,cutoff)
                instant=pd.Timestamp(cutoff_instant(day,cutoff))
                self.assertTrue((selected.publish_time<=instant).all())
                self.assertTrue((selected.start_time.dt.date== (day+timedelta(days=1))).all())
                self.assertFalse(selected.start_time.duplicated().any())
    def test_cutoff_time_uses_uk_summer_offset_and_rejects_invalid_time(self):
        self.assertEqual(cutoff_instant(date(2026,1,15),"09:20").isoformat(),"2026-01-15T09:20:00+00:00")
        self.assertEqual(cutoff_instant(date(2026,7,15),"09:20").isoformat(),"2026-07-15T08:20:00+00:00")
        with self.assertRaises(ValueError): cutoff_instant(date(2026,1,15),"25:00")
    def test_persistence_respects_publication_lag(self):
        from backend.app.config import UTC
        out=pd.DataFrame({"start_time":pd.to_datetime(["2026-01-15T08:00Z","2026-01-15T08:30Z"],utc=True),"actual_mw":[100,200]})
        cutoff=pd.Timestamp("2026-01-15T09:20:00Z").tz_convert(UTC)
        self.assertEqual(persistence(out,cutoff),100)
    def test_zero_actual_wmape_is_zero(self):
        frame=pd.DataFrame({"actual_mw":[0,0],"forecast_mw":[2,3]})
        self.assertEqual(metrics(frame)["wmape"],0)

if __name__=="__main__": unittest.main()
