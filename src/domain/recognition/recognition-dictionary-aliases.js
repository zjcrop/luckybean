// Supplier terminology: 蓝色火山庄园 is Volcán Azul, the same estate as 蓝火山庄园.
// https://www.terraformcoffee.com/zh-cn/products/terraform-variety-costa-rica
export function reviewedRecognitionAliases(row) {
  return row?.[0] === 'ST-CR-VOL2' && row?.[1] === 'CO-CR'
    ? ['蓝色火山庄园', '蓝色火山', 'Volcán Azul', 'Volcan Azul'] : [];
}
