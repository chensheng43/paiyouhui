# 素材说明

本项目不依赖任何外部图片、字体或音频文件，所有视觉/声音素材均为原创或使用系统能力生成：

| 素材 | 文件 / 实现 | 说明 |
| --- | --- | --- |
| 品牌标识 | `public/assets/logo.svg`, `public/assets/favicon.svg` | 原创 SVG，牌扇 + 黑金配色 |
| 牌背 | `public/assets/card-back.svg` | 原创 SVG，金色藤蔓与红底纹样 |
| 筹码 | `public/assets/chip-1.svg`、`chip-5.svg`、`chip-25.svg`、`chip-100.svg` | 原创 SVG，四档面值的筹码盘；按金额拆分显示，配合飞入底池动画 |
| 扑克牌面 | `public/css/app.css` + `public/js/cards.js` | 纯 CSS + Unicode 花色实时绘制，无扫描图 |
| 桌布 / 大厅背景 | `public/css/app.css` | CSS 径向渐变、纹理与椭圆桌面 |
| 头像 | 系统 Emoji（🦊🐼🐯…） | 不打包第三方头像图片 |
| 音效 | `public/js/sound.js` | WebAudio 实时合成的点击/发牌/筹码/胜负音 |

## 许可

- 代码：MIT（见 `LICENSE`）。
- 上述 SVG、CSS 视觉与合成音效：随项目一并提供，可自由用于学习、修改与自建牌局。
- 系统 Emoji 的显示效果取决于操作系统字体，不随项目分发字体文件。

## 为什么不用网上的牌面素材

1. 避免版权与授权不明；
2. 避免外网字体/图片在局域网离线环境下加载失败；
3. SVG/CSS 卡牌在手机、平板、桌面都清晰，且体积极小。

规则参考了公开资料（见 README 的“规则参考”），但代码、界面与素材均为独立实现。
