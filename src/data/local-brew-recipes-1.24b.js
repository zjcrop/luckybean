export const LOCAL_BREW_RECIPES_124B = Object.freeze({
  espresso:{name:'意式浓缩',dose:'16–20 g',water:'成品约 30–45 g',temperature:'90–94°C',grind:'细',steps:['预热冲煮头、手柄和杯具。','称量咖啡并研磨，均匀布粉后压粉。','启动萃取，观察流速和成品重量。','以成品重量、时间和味觉共同判断是否需要调整研磨。']},
  ristretto:{name:'Ristretto',dose:'16–20 g',water:'成品约 20–30 g',temperature:'90–94°C',grind:'细',steps:['按意式浓缩完成准备。','使用较低液重比停止萃取。','以甜感、浓度和是否欠萃为主要校正依据。']},
  lungo:{name:'Lungo',dose:'16–20 g',water:'成品约 45–60 g',temperature:'90–94°C',grind:'细至中细',steps:['按意式浓缩完成准备。','提高成品液重并延长萃取。','注意后段苦涩和干燥感，必要时调粗研磨。']},
  aeropress:{name:'AeroPress',dose:'12–18 g',water:'180–250 g',temperature:'80–95°C',grind:'中细至中粗',steps:['装入滤纸并润湿，加入研磨咖啡。','注水并按所选配方搅拌或浸泡。','达到浸泡时间后平稳下压。','记录粉量、水量、温度和浸泡时间。']},
  moka:{name:'摩卡壶',dose:'填满粉槽并刮平，不压粉',water:'安全阀以下',temperature:'预热水或常温水均可按方案记录',grind:'中细',steps:['下壶加水至安全阀以下。','粉槽装粉并刮平，不压粉。','组装后中小火加热。','出液明显变浅或出现喷溅前结束加热并降温壶底。']},
  french_press:{name:'法压壶',dose:'按容量设定',water:'常用粉水比约 1:14–1:17',temperature:'90–96°C',grind:'中粗至粗',steps:['加入咖啡粉并注入全部热水。','充分润湿后浸泡。','按配方轻搅或破渣。','缓慢压下滤网并及时倒出。']},
  cold_brew:{name:'冷萃',dose:'按容器容量设定',water:'常用粉水比约 1:8–1:15',temperature:'冷水或室温水',grind:'中粗至粗',steps:['咖啡粉与水充分混合。','密封后在设定温度下长时间浸泡。','过滤咖啡液。','按饮用浓度决定是否加水或冰。']},
  cold_drip:{name:'冰滴',dose:'按设备容量设定',water:'冰水滴滤',temperature:'低温',grind:'中至中粗',steps:['铺平粉床并按设备要求放置滤纸。','设置冰水或冷水滴速。','保持滴速稳定完成萃取。','完成后冷藏静置并记录时间。']},
  siphon:{name:'虹吸壶',dose:'按壶体容量设定',water:'常用粉水比约 1:14–1:16',temperature:'接近沸腾后进入上壶',grind:'中等',steps:['下壶加水并加热。','水进入上壶后加入咖啡粉并完成润湿。','按配方搅拌并保持浸泡。','移开热源，待咖啡液回落完成过滤。']},
  cezve:{name:'土耳其咖啡',dose:'按杯量设定',water:'小容量煮制',temperature:'接近沸腾但避免持续剧烈沸腾',grind:'极细',steps:['将极细咖啡粉与水加入 Cezve/Ibrik。','低火缓慢加热。','泡沫上升接近壶口时离火。','按习惯分杯并等待细粉沉降。']},
  phin:{name:'越南滴滤',dose:'约 15–25 g，按滤器调整',water:'约 80–150 g',temperature:'90–96°C',grind:'中至中粗',steps:['加入咖啡粉并轻整粉床。','装好压片后少量注水润湿。','加入剩余热水并盖上盖子。','让咖啡自然滴滤完成。']},
  south_indian_filter:{name:'南印度滤器',dose:'按滤器容量设定',water:'少量热水制备浓缩液',temperature:'接近沸水',grind:'细至中细',steps:['上层滤杯加入咖啡粉。','压片轻放后加入热水。','等待浓缩咖啡液滴入下层。','按饮品需求加入热牛奶、水或糖。']}
});

export const LOCAL_BEVERAGE_RECIPES_124B = Object.freeze({
  americano:{name:'美式',base:'espresso',steps:['完成意式浓缩。','加入热水至目标浓度。']},
  long_black:{name:'Long Black',base:'espresso',steps:['杯中先加入热水。','将意式浓缩加入热水。']},
  latte:{name:'拿铁',base:'espresso',steps:['完成意式浓缩。','打发牛奶形成细腻微泡。','将牛奶与浓缩咖啡融合。']},
  cappuccino:{name:'卡布奇诺',base:'espresso',steps:['完成意式浓缩。','打发具有较明显泡沫层的牛奶。','按目标比例融合咖啡、热奶和奶泡。']},
  flat_white:{name:'Flat White',base:'espresso',steps:['完成意式浓缩。','制作薄而细腻的微泡牛奶。','以较高咖啡浓度与牛奶融合。']},
  cortado:{name:'Cortado',base:'espresso',steps:['完成意式浓缩。','加入较少量蒸汽牛奶，使咖啡与牛奶接近等量。']},
  macchiato:{name:'Macchiato',base:'espresso',steps:['完成意式浓缩。','加入少量奶泡或蒸汽牛奶。']},
  piccolo:{name:'Piccolo',base:'espresso',steps:['制作小份浓缩咖啡。','加入少量细腻蒸汽牛奶。']},
  iced_americano:{name:'冰美式',base:'espresso',steps:['准备冰块和冷水。','完成意式浓缩。','将浓缩与冷水、冰块组合。']},
  iced_latte:{name:'冰拿铁',base:'espresso',steps:['准备冰块和冷牛奶。','完成意式浓缩。','将浓缩、牛奶与冰组合。']},
  shakerato:{name:'Shakerato',base:'espresso',steps:['完成意式浓缩并准备冰块。','将咖啡与冰放入摇壶快速摇匀。','过滤倒入杯中。']},
  espresso_tonic:{name:'Espresso Tonic',base:'espresso',steps:['杯中加入冰块和汤力水。','完成意式浓缩。','缓慢加入浓缩，减少过度起泡。']},
  custom:{name:'特调 / 自定义',base:'custom',steps:['选择基础咖啡萃取方式。','按自定义配方加入其他原料。','保存原料、比例和操作顺序。']}
});
