// Supplier terminology: 蓝色火山庄园 is Volcán Azul, the same estate as 蓝火山庄园.
// https://www.terraformcoffee.com/zh-cn/products/terraform-variety-costa-rica
export function reviewedRecognitionAliases(row) {
  if (row?.[0] === 'ST-CR-VOL2' && row?.[1] === 'CO-CR') return ['蓝色火山庄园', '蓝色火山', 'Volcán Azul', 'Volcan Azul'];
  // Roaster's bilingual origin label: https://nimcoffee.com/products/9
  if (row?.[0] === 'RG-KE-KIR' && row?.[1] === 'CO-KE') return ['麒麟雅加'];
  return [];
}
