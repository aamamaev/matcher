import { classifyInput } from "./classify.js";

const cases = [
  {
    title: "Натуральный цветочный мёд в банке 500 г, без добавления сахара",
    expect: "0409000000",
  },
  {
    title: "Смартфон с сенсорным экраном 6.1 дюйма, 128 ГБ, две nano-SIM",
    expect: "8517130000",
  },
  {
    title: "Зёрна кофе арабика средней обжарки, 250 г, с кофеином",
    expectPrefix: "090121",
  },
  {
    title: "Ноутбук 14 дюймов с процессором и клавиатурой, вес 1.6 кг",
    expect: "8471300000",
  },
  {
    title: "Двухколёсный городской велосипед на шариковых подшипниках",
    expectPrefix: "871200",
  },
  {
    title: "Хлопковая трикотажная футболка для взрослых",
    expect: "6109100000",
  },
];

let failed = 0;
for (const item of cases) {
  const result = await classifyInput({ card: { title: item.title, category: "" } });
  const codes = result.top.map((row) => row.code);
  const ok = item.expect ? codes.includes(item.expect) : codes.some((code) => code.startsWith(item.expectPrefix));
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${item.title}`);
  for (const row of result.top) {
    console.log(`     ${row.rank}. ${row.formatted}  ${row.name}  ${row.score}`);
  }
}

if (failed) {
  console.error(`Не сошлось проверок: ${failed}`);
  process.exit(1);
}
console.log("Все проверочные карточки попали в топ-3");
