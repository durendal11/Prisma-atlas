from typing import Dict

TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "Farrowing Likelihood": {"fil": "Posibilidad ng Pagsilang"},
    "Nesting Onset": {"fil": "Simula ng Pagpupugad"},
    "Active Nesting": {"fil": "Aktibong Pagpupugad"},
    "Crushing Risk": {"fil": "Panganib ng Pagkaipit"},
    "Piglet Count Change": {"fil": "Pagbabago sa Bilang ng Biik"},
    "Posture Change": {"fil": "Pagbabago ng Posisyon"},
    "System Alert": {"fil": "Babala ng Sistema"}
}

def translate(text: str, lang: str = "en") -> str:
    """Translates strings to the target language (if available)"""
    if not text or lang == "en":
        return text
    
    if lang in ('fil', 'tagalog'):
        for eng, tag in TRANSLATIONS.items():
            if text == eng:
                return tag.get("fil", text)
        return text # Add more robust translation mapping here
