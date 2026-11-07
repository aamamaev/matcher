import { useEffect, useState } from "react";

const LIVE_LINKS = [
  {
    label: "Яндекс Маркет · мёд",
    url: "https://market.yandex.ru/card/med-s-lavandoy-pchelkovo-250gr/102995978542",
  },
  {
    label: "AliExpress · мёд",
    url: "https://aliexpress.ru/item/1005003888750398.html",
  },
];

const SAMPLES = [
  {
    label: "Мёд",
    card: {
      title: "Натуральный цветочный мёд в банке 500 г, без добавления сахара",
      category: "Мёд",
    },
  },
  {
    label: "Смартфон",
    card: {
      title: "Смартфон с сенсорным экраном 6.1 дюйма, 128 ГБ, две nano-SIM",
      category: "Смартфоны",
    },
  },
  {
    label: "Кофе",
    card: {
      title: "Зёрна кофе арабика средней обжарки, 250 г, с кофеином",
      category: "Кофе в зёрнах",
    },
  },
  {
    label: "Велосипед",
    card: {
      title: "Двухколёсный городской велосипед на шариковых подшипниках",
      category: "Велосипеды",
    },
  },
];

export default function App() {
  const [health, setHealth] = useState(null);
  const [url, setUrl] = useState("");
  const [manual, setManual] = useState({ title: "", category: "", description: "" });
  const [status, setStatus] = useState("idle");
  const [loadingText, setLoadingText] = useState("Ищу ближайшие коды…");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      for (let attempt = 0; attempt < 10 && !stop; attempt += 1) {
        try {
          const response = await fetch("/api/health");
          if (response.ok) {
            const data = await response.json();
            if (!stop) setHealth(data);
            return;
          }
        } catch {
          // сервер ещё поднимается
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!stop) setHealth({ ok: false, offline: true, points: 0, llm: false });
    }
    load();
    return () => {
      stop = true;
    };
  }, []);

  async function classify(body) {
    setStatus("loading");
    setLoadingText(body.url ? "Открываю карточку в браузере…" : "Ищу ближайшие коды…");
    setError("");
    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось подобрать код");
      setResult(data);
      setStatus("done");
    } catch (reason) {
      setStatus("error");
      setError(reason.message);
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    classify({ url });
  }

  function onManual(event) {
    event.preventDefault();
    classify({ card: manual });
  }

  const nomenclature = health?.nomenclature;

  return (
    <main>
      <header className="top">
        <p className="eyebrow">ЕАЭС · прототип</p>
        <h1>Товар со страницы маркетплейса в код ТН ВЭД</h1>
        <p className="lede">
          Ссылку на карточку открывает браузер. Текст векторизуется, Qdrant возвращает близкие коды,
          и если задан ключ модели, короткий список переранжируется.
        </p>
      </header>

      <section className="sources">
        <h2>Откуда можно взять карточку</h2>
        <ul>
          <li>
            <strong>Яндекс Маркет</strong>
            <span>market.yandex.ru/card/…</span>
          </li>
          <li>
            <strong>AliExpress</strong>
            <span>aliexpress.ru/item/…</span>
          </li>
        </ul>
        <p>
          Wildberries и Ozon в этом браузере останавливают запрос антиботом. Для них вставьте название
          и признаки ниже.
        </p>
      </section>

      <HealthBar health={health} nomenclature={nomenclature} />

      <form className="search" onSubmit={onSubmit}>
        <label htmlFor="url">Ссылка на товар</label>
        <div className="search-row">
          <input
            id="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://market.yandex.ru/card/… или https://aliexpress.ru/item/…"
            inputMode="url"
            autoComplete="off"
          />
          <button type="submit" disabled={status === "loading" || !url.trim()}>
            {status === "loading" ? "Смотрю" : "Подобрать код"}
          </button>
        </div>
        <div className="live-links">
          {LIVE_LINKS.map((item) => (
            <button
              key={item.url}
              type="button"
              onClick={() => {
                setUrl(item.url);
                classify({ url: item.url });
              }}
              disabled={status === "loading"}
            >
              {item.label}
            </button>
          ))}
        </div>
      </form>

      <section className="samples">
        <h2>Без ссылки</h2>
        <div className="chips">
          {SAMPLES.map((sample) => (
            <button key={sample.label} type="button" onClick={() => classify({ card: sample.card })} disabled={status === "loading"}>
              {sample.label}
            </button>
          ))}
        </div>
        <form className="manual" onSubmit={onManual}>
          <label>
            Название и признаки
            <textarea
              value={manual.title}
              onChange={(event) => setManual({ ...manual, title: event.target.value })}
              rows={3}
              placeholder="Например: беспроводные наушники с микрофоном, не колонка"
            />
          </label>
          <div className="manual-grid">
            <label>
              Категория площадки
              <input
                value={manual.category}
                onChange={(event) => setManual({ ...manual, category: event.target.value })}
              />
            </label>
            <label>
              Описание
              <input
                value={manual.description}
                onChange={(event) => setManual({ ...manual, description: event.target.value })}
              />
            </label>
          </div>
          <button type="submit" disabled={status === "loading" || !manual.title.trim()}>
            Подобрать по тексту
          </button>
        </form>
      </section>

      {status === "loading" && <p className="status">{loadingText}</p>}
      {status === "error" && <p className="error">{error}</p>}
      {result && <Result result={result} />}
    </main>
  );
}

function HealthBar({ health, nomenclature }) {
  if (!health) return <p className="status">Проверяю индекс…</p>;
  if (health.offline) return <p className="status warn">API не отвечает на порту 8787.</p>;
  if (!health.ok) {
    return (
      <p className="status warn">
        Индекс ещё не собран. Запустите Qdrant и команду <code>npm run index</code>.
      </p>
    );
  }
  return (
    <p className="status">
      ФНС, версия {nomenclature?.version || "—"} от {nomenclature?.date || "—"} · {nomenclature?.leaves || health.points}{" "}
      кодов · переранжирование {health.llm ? "включено" : "выключено"}
    </p>
  );
}

function Result({ result }) {
  const { product, top, retrieval, meta } = result;
  return (
    <section className="result">
      <article className="product">
        <p className="eyebrow">{labelMarketplace(product.marketplace)}</p>
        <h2>{product.title}</h2>
        {product.category && <p className="category">{product.category}</p>}
        {product.attributes?.length > 0 && (
          <dl>
            {product.attributes.slice(0, 8).map((attribute) => (
              <div key={attribute.name}>
                <dt>{attribute.name}</dt>
                <dd>{attribute.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {product.description && <p className="description">{product.description}</p>}
        {product.warnings?.length > 0 && (
          <ul className="warnings">
            {product.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </article>

      {top[0]?.score < 0.9 && (
        <p className="status warn">
          Близкого заголовка нет: это просто наименее далёкие коды. Для такого товара список нужно
          переранжировать моделью или расширять размеченные примеры.
        </p>
      )}

      <ol className="codes">
        {top.map((item) => (
          <li key={item.code}>
            <div className="code-head">
              <span className="rank">{item.rank}</span>
              <span className="code">{item.formatted}</span>
              <span className="score">близость {item.score.toFixed(2)}</span>
            </div>
            <p className="leaf">{item.name}</p>
            <p className="path">{item.path}</p>
            {item.hs6 && <p className="hs">HS6: {item.hs6}</p>}
            {item.reason && <p className="reason">{item.reason}</p>}
            {item.examples?.length > 0 && <p className="example">Рядом с примером: {item.examples.join("; ")}</p>}
          </li>
        ))}
      </ol>

      <details>
        <summary>Как нашлось · {meta.mode === "llm" ? `модель ${meta.model}` : "только вектор"}</summary>
        <ol className="retrieval">
          {retrieval.map((item) => (
            <li key={item.code}>
              <span>{item.formatted}</span>
              <span>{item.name}</span>
              <span>{item.score.toFixed(3)}</span>
            </li>
          ))}
        </ol>
      </details>
      <p className="disclaimer">
        Это не таможенное решение и не подтверждение кода. В выгрузке ФНС у многих листьев осталось имя
        «прочие»: смысл тогда сидит в товарной позиции и в английской субпозиции HS6.
      </p>
    </section>
  );
}

function labelMarketplace(marketplace) {
  if (marketplace === "wildberries") return "Wildberries";
  if (marketplace === "ozon") return "Ozon";
  if (marketplace === "yandex") return "Яндекс Маркет";
  if (marketplace === "aliexpress") return "AliExpress";
  return "Карточка вручную";
}
