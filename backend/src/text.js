export function collapse(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export function cleanName(value) {
  return collapse(value)
    .replace(/^(?:[-–—]\s*)+/, "")
    .trim();
}

export function formatCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.length === 6) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits;
}

export function productToText(product) {
  const attributes = (product.attributes || [])
    .slice(0, 40)
    .map((item) => `${item.name}: ${item.value}`)
    .join(". ");
  return [
    product.title,
    product.brand && `Бренд: ${product.brand}`,
    product.category && `Категория площадки: ${product.category}`,
    attributes && `Характеристики: ${attributes}`,
    product.description && `Описание: ${collapse(product.description).slice(0, 1200)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPassage(node) {
  return collapse(
    [
      `Код ТН ВЭД ${node.formatted}.`,
      node.sectionName && `Раздел: ${node.sectionName}.`,
      node.groupName && `Группа ${node.code.slice(0, 2)}: ${node.groupName}.`,
      node.positionName && `Позиция ${node.code.slice(0, 4)}: ${node.positionName}.`,
      node.hs6 && `Субпозиция ${node.code.slice(0, 4)} ${node.code.slice(4, 6)}: ${node.hs6}.`,
      `Подсубпозиция: ${node.leaf}.`,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
