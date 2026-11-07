"""Снимает одну карточку с площадки тем же контекстом, что парсер Кинопоиска.

Куки Кинопоиска сюда не подставляются: они от другого сайта.
"""

from __future__ import annotations

import json
import sys

from playwright.sync_api import sync_playwright

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

STARTS = [
    ("wildberries", "https://www.wildberries.ru/catalog/0/search.aspx?search=мёд%20натуральный"),
    ("ozon", "https://www.ozon.ru/search/?text=мёд%20натуральный"),
    ("yandex", "https://market.yandex.ru/search?text=мёд%20натуральный"),
    ("aliexpress", "https://aliexpress.ru/wholesale?SearchText=мёд%20натуральный"),
]


def read_page(page) -> dict:
    return page.evaluate(
        """() => {
          const text = (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 1800);
          const links = [...document.querySelectorAll('a')]
            .map((a) => a.href)
            .filter((href) => /wildberries\\.ru\\/catalog\\/\\d+|ozon\\.ru\\/product\\/|market\\.yandex\\.ru\\/(card|product)|aliexpress\\.ru\\/item\\//.test(href));
          return {
            url: location.href,
            title: document.title,
            h1: (document.querySelector('h1') || {}).innerText || '',
            text,
            links: [...new Set(links)].slice(0, 5),
          };
        }"""
    )


def main() -> None:
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=(
                "/Users/alexmamaev/Library/Caches/ms-playwright/"
                "chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/"
                "Contents/MacOS/Google Chrome for Testing"
            ),
        )
        context = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1920, "height": 1080},
            locale="ru-RU",
            timezone_id="Europe/Moscow",
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml",
                "Accept-Language": "ru-RU,ru;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
            },
        )
        page = context.new_page()
        for name, url in STARTS:
            item = {"marketplace": name, "start": url}
            try:
                response = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(4000)
                item["status"] = response.status if response else None
                item["page"] = read_page(page)
            except Exception as error:
                item["error"] = str(error)
            results.append(item)
            print(json.dumps(item, ensure_ascii=False), flush=True)
        browser.close()
    json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
