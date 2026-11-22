"""Intentionally NOT implemented: wire up the app's real OCR engine. Do not report fake success."""
def recognize_receipt(image_path: str) -> dict:
    raise NotImplementedError('The current v4 app has no OCR engine. Install or implement one before testing.')
