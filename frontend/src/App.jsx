import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const HONEY_URL = "https://market.yandex.ru/card/med-s-lavandoy-pchelkovo-250gr/102995978542";
const ALI_URL = "https://aliexpress.ru/item/1005003888750398.html";

const URL_STEPS = [
  ["open", "Открываю страницу"],
  ["read", "Читаю карточку"],
  ["embed", "Векторизую"],
  ["search", "Ищу коды"],
];

const TEXT_STEPS = [
  ["embed", "Векторизую"],
  ["search", "Ищу коды"],
];

const SAMPLES = [
  { label: "Мёд", card: { title: "Натуральный цветочный мёд в банке 500 г, без добавления сахара", category: "Мёд" } },
  { label: "Смартфон", card: { title: "Смартфон с сенсорным экраном 6.1 дюйма, 128 ГБ, две nano-SIM", category: "Смартфоны" } },
  { label: "Кофе", card: { title: "Зёрна кофе арабика средней обжарки, 250 г, с кофеином", category: "Кофе в зёрнах" } },
  { label: "Велосипед", card: { title: "Двухколёсный городской велосипед на шариковых подшипниках", category: "Велосипеды" } },
];

export default function App() {
  const [health, setHealth] = useState(null);
  const [url, setUrl] = useState(HONEY_URL);
  const [manual, setManual] = useState({ title: "", category: "", description: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [clock, setClock] = useState(0);

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

  useEffect(() => {
    if (status !== "loading") return undefined;
    const timer = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(timer);
  }, [status]);

  async function classify(body) {
    const steps = [...(body.url ? URL_STEPS : TEXT_STEPS)];
    if (health?.llm) steps.push(["rerank", "Выбираю из списка"]);
    const started = Date.now();
    setStatus("loading");
    setError("");
    setResult(null);
    setProgress({
      steps,
      active: steps[0][0],
      done: [],
      detail: body.url ? "Chrome открывает страницу магазина" : "Считаю вектор текста карточки",
      preview: null,
      stageStarted: started,
    });
    setClock(started);
    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("ndjson")) {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось подобрать код");
        setResult(data);
        setStatus("done");
        setProgress(null);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = null;
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "progress") {
            setProgress((current) => {
              const order = current.steps.map(([id]) => id);
              const activeIndex = order.indexOf(event.stage);
              return {
                ...current,
                active: event.stage,
                done: order.slice(0, Math.max(activeIndex, 0)),
                detail: event.detail || "",
                preview: event.product || current.preview,
                stageStarted: Date.now(),
              };
            });
          }
          if (event.type === "result") finalResult = event.result;
        }
        if (chunk.done) break;
      }
      if (!finalResult) throw new Error("Сервер закрыл ответ, не прислав коды");
      setResult(finalResult);
      setStatus("done");
      setProgress(null);
    } catch (reason) {
      setStatus("error");
      setError(reason.message);
      setProgress(null);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="inherit" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ТН ВЭД
          </Typography>
          <HealthChip health={health} />
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Код товара
            </Typography>
            <Typography color="text.secondary">
              Ссылка на карточку Яндекс Маркета или AliExpress. Wildberries и Ozon этот браузер не пускает.
            </Typography>
          </Box>

          <Card elevation={1}>
            <CardContent>
              <Stack spacing={2} component="form" onSubmit={(event) => { event.preventDefault(); classify({ url }); }}>
                <TextField
                  id="url"
                  label="Ссылка на товар"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  fullWidth
                  helperText="Шаблон уже подставлен: мёд с Яндекс Маркета"
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button type="submit" variant="contained" size="large" disabled={status === "loading" || !url.trim()}>
                    {status === "loading" ? "Смотрю" : "Подобрать код"}
                  </Button>
                  <Button variant="text" disabled={status === "loading"} onClick={() => { setUrl(HONEY_URL); }}>
                    Мёд на Маркете
                  </Button>
                  <Button variant="text" disabled={status === "loading"} onClick={() => { setUrl(ALI_URL); classify({ url: ALI_URL }); }}>
                    Мёд на AliExpress
                  </Button>
                </Stack>
                {progress && <ProgressPanel progress={progress} clock={clock} />}
              </Stack>
            </CardContent>
          </Card>

          {status === "error" && <Alert severity="error">{error}</Alert>}
          {result && <Result result={result} />}

          <Accordion elevation={0} disableGutters sx={{ bgcolor: "transparent", "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Без ссылки</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {SAMPLES.map((sample) => (
                    <Chip key={sample.label} label={sample.label} onClick={() => classify({ card: sample.card })} disabled={status === "loading"} />
                  ))}
                </Stack>
                <TextField
                  label="Название и признаки"
                  value={manual.title}
                  onChange={(event) => setManual({ ...manual, title: event.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    label="Категория площадки"
                    value={manual.category}
                    onChange={(event) => setManual({ ...manual, category: event.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Описание"
                    value={manual.description}
                    onChange={(event) => setManual({ ...manual, description: event.target.value })}
                    fullWidth
                  />
                </Stack>
                <Box>
                  <Button variant="outlined" disabled={status === "loading" || !manual.title.trim()} onClick={() => classify({ card: manual })}>
                    Подобрать по тексту
                  </Button>
                </Box>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Typography variant="caption" color="text.secondary">
            Это не таможенное решение. У многих листьев номенклатуры имя «прочие», смысл тогда в позиции и в субпозиции HS6.
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}

function HealthChip({ health }) {
  if (!health) return <Chip size="small" label="Проверяю индекс" />;
  if (health.offline) return <Chip size="small" color="error" label="API не отвечает" />;
  if (!health.ok) return <Chip size="small" color="warning" label="Индекс пуст" />;
  const count = health.nomenclature?.leaves || health.points;
  return <Chip size="small" color="primary" variant="outlined" label={`${count} кодов`} />;
}

function ProgressPanel({ progress, clock }) {
  const elapsed = Math.max(0, clock - progress.stageStarted);
  return (
    <Stack spacing={1} aria-live="polite">
      <LinearProgress />
      <List dense disablePadding>
        {progress.steps.map(([id, label]) => {
          const state = progress.done.includes(id) ? "done" : progress.active === id ? "active" : "wait";
          return (
            <ListItem key={id} disableGutters sx={{ py: 0.25, color: state === "wait" ? "text.disabled" : "text.primary" }}>
              <ListItemText
                primary={state === "active" ? `${label} · ${(elapsed / 1000).toFixed(1)} с` : label}
                primaryTypographyProps={{ fontWeight: state === "active" ? 500 : 400, variant: "body2" }}
              />
            </ListItem>
          );
        })}
      </List>
      {progress.detail && <Typography variant="body2" color="text.secondary">{progress.detail}</Typography>}
      {progress.preview && (
        <Typography variant="body2">
          {labelMarketplace(progress.preview.marketplace)} · {progress.preview.title}
        </Typography>
      )}
    </Stack>
  );
}

function Result({ result }) {
  const { product, top, retrieval, meta } = result;
  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">{labelMarketplace(product.marketplace)}</Typography>
          <Typography variant="h6">{product.title}</Typography>
          {product.category && <Typography color="text.secondary">{product.category}</Typography>}
          {product.attributes?.length > 0 && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
              {product.attributes.slice(0, 6).map((attribute) => (
                <Chip key={attribute.name} size="small" variant="outlined" label={`${attribute.name}: ${attribute.value}`} />
              ))}
            </Stack>
          )}
          {product.warnings?.map((warning) => (
            <Alert key={warning} severity="warning" sx={{ mt: 1 }}>{warning}</Alert>
          ))}
        </CardContent>
      </Card>

      {top[0]?.score < 0.9 && (
        <Alert severity="warning">Близкого заголовка нет: это наименее далёкие коды.</Alert>
      )}

      {top.map((item) => (
        <Card key={item.code} elevation={item.rank === 1 ? 2 : 0} variant={item.rank === 1 ? "elevation" : "outlined"}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="baseline">
              <Typography variant="h5" sx={{ fontFamily: "Roboto Mono, monospace" }}>{item.formatted}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>{item.score.toFixed(2)}</Typography>
            </Stack>
            <Typography sx={{ mt: 1 }}>{item.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.path}</Typography>
            {item.hs6 && <Typography variant="caption" color="text.secondary">HS6: {item.hs6}</Typography>}
            {item.reason && <Typography sx={{ mt: 1 }}>{item.reason}</Typography>}
          </CardContent>
        </Card>
      ))}

      <Accordion elevation={0} disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Как нашлось · {meta.mode === "llm" ? meta.model : "только вектор"}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List dense>
            {retrieval.map((item) => (
              <ListItem key={item.code} disableGutters>
                <ListItemText
                  primary={`${item.formatted} · ${item.score.toFixed(3)}`}
                  secondary={item.name}
                  primaryTypographyProps={{ fontFamily: "Roboto Mono, monospace", variant: "body2" }}
                />
              </ListItem>
            ))}
          </List>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}

function labelMarketplace(marketplace) {
  if (marketplace === "wildberries") return "Wildberries";
  if (marketplace === "ozon") return "Ozon";
  if (marketplace === "yandex") return "Яндекс Маркет";
  if (marketplace === "aliexpress") return "AliExpress";
  return "Карточка вручную";
}
