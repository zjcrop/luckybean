function clean(value=''){return String(value||'').replace(/\s+/g,' ').trim();}
function number(value){const n=Number(String(value||'').replace(/[,，]/g,''));return Number.isFinite(n)?n:null;}
function firstMatch(text,patterns){for(const re of patterns){const m=text.match(re);if(m)return clean(m[1]||m[0]);}return '';}

export function classifyOrderText(input=''){
  const text=String(input||'');
  const hits=[/订单号|订单编号|下单时间|实付款|实付|商品金额|合计|付款金额/i,/¥|￥|CNY|RMB/i,/已发货|运输中|待收货|已签收|物流/i].filter(re=>re.test(text)).length;
  return {isOrder:hits>=2,confidence:hits>=3?.94:hits===2?.72:.2};
}

export function parseCoffeeOrderText(input=''){
  const raw=String(input||'');
  const text=raw.replace(/[\u00a0\t]+/g,' ').replace(/\r/g,'');
  const paid=firstMatch(text,[/(?:实付款|实付金额|付款金额|订单实付|合计)[：:\s]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,/[¥￥]\s*([0-9]+(?:\.[0-9]{1,2})?)/]);
  const list=firstMatch(text,[/(?:商品金额|原价|单价)[：:\s]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i]);
  const shipping=firstMatch(text,[/(?:运费|配送费)[：:\s]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i]);
  const discount=firstMatch(text,[/(?:优惠|折扣|优惠金额)[：:\s-]*[¥￥]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i]);
  const qty=firstMatch(text,[/(?:数量|数量共|购买数量)[：:\s]*[x×*]?\s*([0-9]{1,3})/i,/\b[x×]\s*([0-9]{1,3})\b/i]);
  const weightMatch=text.match(/(?:净含量|规格|重量)[：:\s]*([0-9]+(?:\.[0-9]+)?)\s*(kg|g|克|千克)/i)||text.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|克|千克)\b/i);
  const date=firstMatch(text,[/(?:下单时间|订单时间|购买时间|创建时间)[：:\s]*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?)/i,/(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})/]);
  const merchant=firstMatch(text,[/(?:店铺|商家|卖家|烘焙商)[：:\s]*([^\n]{2,60})/i]);
  const orderId=firstMatch(text,[/(?:订单号|订单编号)[：:\s]*([A-Za-z0-9_-]{6,64})/i]);
  const status=/(已签收|已完成)/.test(text)?'delivered':/(运输中|待收货|已发货)/.test(text)?'in_transit':/(待发货|已下单|待付款|已付款)/.test(text)?'ordered':'in_transit';
  const product=firstMatch(text,[/(?:商品名称|商品|品名)[：:\s]*([^\n]{3,120})/i]);
  let weightG=null;
  if(weightMatch){weightG=number(weightMatch[1]);if(/kg|千克/i.test(weightMatch[2]))weightG*=1000;}
  const privacyRedactions=[];
  if(/1[3-9]\d{9}/.test(text))privacyRedactions.push('phone');
  if(/(?:收货地址|详细地址|地址)[：:]/.test(text))privacyRedactions.push('address');
  return {
    documentType:'order_page', productName:product, logisticsStatus:status,
    purchase:{currency:/\$|USD/i.test(text)?'USD':/€|EUR/i.test(text)?'EUR':'CNY',listPrice:number(list),paidPrice:number(paid),quantity:number(qty)||1,weight:weightG,shippingFee:number(shipping),discount:number(discount),orderDate:date?date.replace(/[年月]/g,'-').replace(/日/g,'').replace(/\//g,'-'):null,merchant:merchant||null,orderId:orderId||null},
    privacyRedactions,
    rawText:raw
  };
}
