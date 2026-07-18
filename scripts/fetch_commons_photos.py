#!/usr/bin/env python3
import html
import argparse
import json
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "AsiaGeographyLesson/3.0 (educational GitHub Pages project)"
MAX_PHOTOS = 10
FREE_LICENSES = {"CC0", "Public domain"}
REJECT_WORDS = {
    "map", "locator", "location", "logo", "icon", "flag", "seal", "diagram",
    "route", "highway", "coat of arms", "poster", "drawing", "painting",
    "chocolate", "rendered", "banner", "karte", "composite image", "print; prints",
    "pintura", "óleo sobre tela", "satellite", "copernicus sentinel"
}

QUERY_OVERRIDES = {
    "himalayas": "Himalayas mountain landscape",
    "ural-mountains": "Ural Mountains landscape",
    "tian-shan": "Tian Shan Kyrgyzstan mountain",
    "yangtze-river": "Yangtze River China",
    "mekong-river": "Mekong River landscape",
    "ganges-river": "Ganges River landscape",
    "lake-baikal": "Lake Baikal landscape",
    "caspian-sea": "Caspian Sea coast landscape",
    "dead-sea": "Dead Sea landscape",
    "tibetan-plateau": "Tibet plateau landscape",
    "gobi-desert": "Gobi Desert landscape",
    "zhangjiajie": "Zhangjiajie National Forest Park",
    "halong-bay": "Ha Long Bay karst landscape",
    "fuji-hakone-izu-np": "Mount Fuji landscape Japan",
    "komodo-np": "Komodo National Park landscape",
    "sundarbans-np": "Sundarbans mangrove landscape",
    "sagarmatha-np": "Sagarmatha National Park landscape",
    "kinabalu-park": "Mount Kinabalu Sabah landscape",
}

QUERY_ADDITIONS = {
    "tibetan-plateau": ["Tibetan Plateau landscape", "Qinghai Tibet plateau"],
    "kinabalu-park": ["Kinabalu Park", "Mount Kinabalu"],
}


def clean_html(value):
    text = html.unescape(value or "")
    return re.sub(r"<[^>]+>", "", text).strip()


def api_request(params):
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 4:
                raise
            retry_after = int(error.headers.get("Retry-After", 4 * (attempt + 1)))
            print(f"Commons rate limit; retrying in {retry_after}s", flush=True)
            time.sleep(retry_after)


def fetch_photos(place):
    primary_query = QUERY_OVERRIDES.get(place["id"], place.get("scientificName", place["nameEn"]))
    queries = [primary_query, *QUERY_ADDITIONS.get(place["id"], [])]
    photos = []
    seen_images = set()
    for query in queries:
        data = api_request({
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "generator": "search",
            "gsrnamespace": 6,
            "gsrlimit": 50,
            "gsrsearch": f"{query} filetype:bitmap",
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 900,
        })
        for page in data.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [{}])[0]
            metadata = info.get("extmetadata", {})
            title = page.get("title", "").removeprefix("File:")
            description = clean_html(metadata.get("ImageDescription", {}).get("value"))
            searchable_text = f"{title} {description}".lower()
            license_name = metadata.get("LicenseShortName", {}).get("value", "")
            width = info.get("width", 0)
            height = info.get("height", 0)
            image_url = info.get("thumburl") or info.get("url")
            if not image_url or image_url in seen_images:
                continue
            if not (license_name.startswith("CC") or license_name in FREE_LICENSES):
                continue
            if width < 1000 or height < 500:
                continue
            if any(word in searchable_text for word in REJECT_WORDS):
                continue
            seen_images.add(image_url)
            photos.append({
                "title": description or title,
                "image": image_url,
                "source": info.get("descriptionurl"),
                "author": clean_html(metadata.get("Artist", {}).get("value")) or "Wikimedia Commons contributor",
                "license": license_name,
                "licenseUrl": metadata.get("LicenseUrl", {}).get("value", "https://creativecommons.org/licenses/"),
                "panorama": width / max(height, 1) >= 2.0,
                "width": width,
                "height": height,
            })
            if len(photos) >= MAX_PHOTOS:
                break
        if len(photos) >= MAX_PHOTOS:
            break
    return photos


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("place_ids", nargs="*", help="Only refresh these place IDs")
    args = parser.parse_args()
    places = json.loads((ROOT / "data" / "places.json").read_text())
    species = json.loads((ROOT / "data" / "species.json").read_text())
    items = places + species
    output = ROOT / "data" / "photos.json"
    result = json.loads(output.read_text()) if output.exists() else {}
    for place in items:
        if args.place_ids and place["id"] not in args.place_ids:
            continue
        photos = fetch_photos(place)
        result[place["id"]] = photos
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(f"{place['id']}: {len(photos)}", flush=True)
        time.sleep(0.8)


if __name__ == "__main__":
    main()
