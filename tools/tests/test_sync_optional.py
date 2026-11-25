"""progress.py の同期先：PJ の中（必須）と親フォルダ（任意）。親が無くても失敗せず、勝手に作らない"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import progress  # noqa: E402


class SyncOptional(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / "a.csv"
        self.src.write_text("x", encoding="utf-8")

    def test_必須の同期先は作って書く(self):
        dest = self.tmp / "in" / "export"
        progress.copy_to(dest, [(self.src, "a.csv")], optional=False)
        self.assertEqual((dest / "a.csv").read_text(encoding="utf-8"), "x")

    def test_任意の同期先は_親が無いなら_作らず飛ばす(self):
        dest = self.tmp / "00_全体進捗" / "暮らしベース"
        msg = progress.copy_to(dest, [(self.src, "a.csv")], optional=True)
        self.assertFalse((self.tmp / "00_全体進捗").exists())
        self.assertIn("飛ばし", msg)

    def test_任意の同期先は_親があれば書く(self):
        (self.tmp / "00_全体進捗").mkdir()
        dest = self.tmp / "00_全体進捗" / "暮らしベース"
        progress.copy_to(dest, [(self.src, "a.csv")], optional=True)
        self.assertTrue((dest / "a.csv").exists())


if __name__ == "__main__":
    unittest.main()
