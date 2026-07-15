<div align="center">

# Sphotography

**全屏地图式摄影主题 · A fullscreen, map-first photography theme for WordPress**

把 WordPress 收进后台，让前端只剩一张可探索的世界地图 —— 照片作为标记散布其上，点击即展开文章、翻页定位、飞向坐标。

<br>

![Version](https://img.shields.io/badge/version-1.2.3-1abc9c)
![WordPress](https://img.shields.io/badge/WordPress-5.x%20%7C%206.x-21759b)
![MapLibre GL JS](https://img.shields.io/badge/MapLibre%20GL%20JS-4.x-295cff)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-f7df1e)
![License](https://img.shields.io/badge/license-GPL--2.0-blue)

</div>

---

## 目录

- [设计理念](#设计理念)
- [功能特性](#功能特性)
- [动画与动效](#动画与动效)
- [界面布局](#界面布局)
- [安装](#安装)
- [快速开始](#快速开始)
- [主题配置](#主题配置)
- [项目结构](#项目结构)
- [数据流](#数据流)
- [更新](#更新)
- [技术依赖](#技术依赖)
- [许可证](#许可证)

---

## 设计理念

访客进入网站，看到的不是一份文章列表，而是一整块占据视口的暗色（或浅色）矢量地图。每一张带有位置信息的照片，都是地图上的一枚标记；密集处自动聚合成会「融合 / 分裂」的水滴。所有面板都是漂浮在地图之上的毛玻璃卡片 —— 边栏、文章、照片网格彼此联动，而地图始终是那张底片。

> 核心哲学：**内容在后台，探索在前端。** WordPress 负责写作与管理，Sphotography 负责把内容变成一次可以「逛」的旅程。

---

## 功能特性

### 🗺️ 地图与探索
- **全屏矢量地图** —— 基于 MapLibre GL JS，CartoDB 底图（暗色 *Dark Matter* / 浅色 *Positron*），无需任何 API Token
- **夜间模式** —— 跟随系统 / 强制浅色 / 强制暗色三档，深色方案另有 经典 / 蓝调 / 紫调 可选
- **水滴式标记与聚合** —— 照片以 HTML 水滴标记呈现，邻近点经 gooey 滤镜融合为聚合簇，随缩放实时合并 / 分裂
- **导航与比例尺控件** —— 内建缩放 / 指南针、公制比例尺

### 📚 边栏与文章
- **可展开 / 收起的左侧边栏** —— 展示最近文章，默认收起（可在后台切换默认展开）
- **即时搜索** —— `Ctrl / ⌘ + K` 聚焦搜索框，输入即过滤
- **分类筛选** —— 顶部筛选按钮弹出分类芯片，多选即时生效，选中项以主题色高亮
- **文章展开页** —— 通过 REST 加载完整 WordPress 正文，标题、元信息、分类 / 地域标签一应俱全
- **内联评论系统** —— 文章页直接接入 WordPress 评论：登录用户直接发表，访客填写昵称与邮箱，样式与前端统一

### 🖼️ 照片与联动（桌面端亮点）
- **点击标记 → 照片网格** —— 在标记点旁浮出 1~多张照片的网格面板，随地图移动实时跟随
- **照片 → 文章翻页定位** —— 桌面端点击网格照片，直接以窗口式动画展开该图片所在文章，并顺滑「翻页」定位到正文中对应段落
- **文章图片 → 飞向坐标** —— 桌面端点击文章正文中带位置信息的图片，后台地图先平移、再放大至 **5km / 1cm** 比例尺，把该点位稳稳停在面板右侧的地图区域中心
- **移动端详情 Sheet** —— 移动端保持底部抽屉式大图详情，含相机参数、拍摄日期、描述与标签

### 👤 站点信息
- **作者卡片** —— 常驻右下角，展示头像、昵称、简介
- **一言格言** —— 可选的每次刷新随机格言
- **自定义页脚** —— 可选的毛玻璃页脚区块

### 🛠️ 后台管理
- **主题全局配置页** —— 独立顶级菜单，7 大模块（详见[主题配置](#主题配置)）
- **媒体库 EXIF 提取** —— 上传图片自动读取 GPS / 相机型号 / 拍摄日期，也可一键手动读取或手填坐标
- **CDN 来源切换** —— jsDelivr / unpkg / cdnjs 三选一
- **GitHub 一键更新** —— 选择分支、比较版本、直接从仓库更新主题
- **后台 Sphotography 风格** —— 可选把后台配置页也套上主题的衬线 + 主题色外观

### ⚙️ 技术特性
- **纯原生 JavaScript** —— 无任何前端框架，IIFE 闭包，零全局污染
- **REST + 内联数据双通道** —— 当服务器拦截 REST（403）时，自动回退到 PHP 内联嵌入的数据
- **CSS 变量驱动的设计系统** —— 主色、圆角、阴影、字体全部由 `theme_mod` → CSS 变量实时输出
- **响应式三断点** —— 桌面 / 平板 / 移动分别适配
- **无障碍友好** —— 面板具备 `role` / `aria-*`，并完整尊重系统「减弱动态」偏好

---

## 动画与动效

动效是 Sphotography 的核心体验之一 —— 面板不是「出现」，而是从它的来处**生长**出来。以下为完整动效清单。

| 动效 | 触发时机 | 描述 | 实现 |
|------|---------|------|------|
| **品牌光圈加载** | 首次加载 | SVG 光圈双环旋转描边 + 呼吸核心圆点 + 底部进度条，附每 3 秒随机轮换的加载提示语 | CSS `@keyframes`：`apertureRotate` / `ringDash` / `apertureBreathe` / `progressExpand` |
| **水滴聚合（融合 / 分裂）** | 缩放改变聚合关系 | HTML 水滴标记在缩放时朝聚合中心汇聚或散开，邻近水滴经 SVG gooey 滤镜融合，读起来像液体的合并与分裂 | `feGaussianBlur` + `feColorMatrix` goo 滤镜 · WAAPI（620ms，`cubic-bezier(0.22,1,0.36,1)`） |
| **窗口式展开 / 收起（DWM 风格）** | 打开 / 关闭文章 | 借鉴 Windows DWM 窗口最小化 / 还原：全分辨率快照作为一整块刚性矩形，从边栏卡片位置缩放并平移展开，收起时缩回卡片。基于 FLIP，仅 `transform` / `opacity` 参与动画，无重排、无变形 | WAAPI FLIP 克隆层（展开 260ms / 收起 240ms，`cubic-bezier(0.18,0.85,0.28,1)`） |
| **同源缩放复用** | 筛选面板、照片网格 | 筛选面板与照片网格复用同一套窗口式缩放动画；照片网格以其对应的地图标记点位为原点展开 / 收回，随地图实时计算 | 同上 |
| **照片 → 文章翻页定位** `v1.2.3` | 桌面端点击地图照片 | 窗口式展开文章后，面板自动缓动滚动，像手动翻页一样顺滑地把正文中该图片所在段落带到视野内 | WAAPI + 自定义 ease-in-out 滚动（~650ms） |
| **文章图片 → 地图平移缩放** `v1.2.3` | 桌面端点击文章内地理图片 | 后台地图先按当前比例尺平移（~1200ms），使该点位落于面板右侧可视地图区域中心，短暂停顿后以该点为中心放大至 5km/1cm（~1600ms），衔接如手动拖拽 | MapLibre `easeTo`：平移 → `around` 缩放，`ease-in-out-sine` |
| **边栏滑入 / 滑出** | 展开 / 收起边栏 | 边栏沿 X 轴平移并淡入淡出 | CSS transition（0.5s，`cubic-bezier(0.32,0.72,0,1)`） |
| **内容级联入场** | 文章展开 | 标题先上滑淡入，正文随后错时淡入，形成阅读层次 | CSS transition + 延迟 |
| **卡片交错显现** | 边栏列表渲染 | 文章卡片依次错时淡入并上移 | WAAPI 交错动画 |
| **作者卡片 / 头像入场** | 首屏 | 卡片弹入，头像旋转显现 | CSS `@keyframes`：`aboutCardPop` / `avatarSpinIn` |
| **展开按钮弹跳** | 边栏收起后 | 边栏展开按钮弹性出现 | CSS `@keyframes expandBtnPop` |
| **移动端详情 Sheet** | 移动端点击照片 | 底部抽屉式 Sheet 上滑，拖拽把手呼吸脉冲 | CSS `@keyframes dragHandlePulse` |
| **图片揭示** | 详情大图 | 图片渐显呈现 | CSS `@keyframes imageReveal` |
| **减弱动态降级** | 系统开启「减弱动态」 | 上述所有关键动效自动降级为瞬时切换 / 简单淡入 | `prefers-reduced-motion` 守卫 |

---

## 界面布局

### 桌面端（≥768px）

```
┌──────────────────────────────────────────────────────────┐
│  ┌──────────┐                                             │
│  │ 边栏 300px│      ┌──────────────────┐                   │
│  │ ┌──────┐ │      │ 文章展开页         │                   │
│  │ │搜索 筛选│ │      │ ≤600px           │    ┌──────────┐   │
│  │ ├──────┤ │      │ 覆盖在地图之上     │    │ 照片网格   │   │
│  │ │文章 1 │ │      │                  │    │ 标记点旁   │   │
│  │ │文章 2 │ │      └──────────────────┘    └──────────┘   │
│  │ │ ...   │ │                                             │
│  │ └──────┘ │             全 屏 地 图            ┌──────┐   │
│  └──────────┘                                   │作者卡片│   │
│  ┌────────┐                                     └──────┘   │
│  │页脚(可选)│      ◀ 边栏收起时显示展开按钮                   │
│  └────────┘                                                │
└──────────────────────────────────────────────────────────┘
   边栏收起后 → 地图占满整个视口
```

### 移动端（<768px）

```
┌────────────────────┐      展开边栏 / 文章时：
│                    │      ┌────────────────────┐
│    全屏地图         │      │ 边栏 / 文章 全屏覆盖 │
│           ┌──────┐ │      │ ✕                  │
│           │作者卡片│ │      │ ──────────────     │
│           └──────┘ │      │ 内容（可滚动）      │
│ ┌────────────────┐ │      │                    │
│ │ 照片详情底部 Sheet│ │      └────────────────────┘
│ └────────────────┘ │
└────────────────────┘
```

> 所有面板均为毛玻璃材质（`backdrop-filter: blur(24px)`，半透明背景），透出底层地图瓦片；层级由 z-index 30~130 依次堆叠，地图恒在最底层。

---

## 安装

### 方式一：从 GitHub Release 安装（推荐）

1. 打开 [Releases 页面](https://github.com/ShirazuNagisa/sphotography/releases)
2. 下载最新的 `sphotography.zip`
3. WordPress 后台 → **外观 → 主题 → 安装主题 → 上传主题**
4. 选择 zip 上传并 **现在安装** → **启用**

### 方式二：从 GitHub 克隆

```bash
cd wp-content/themes/
git clone https://github.com/ShirazuNagisa/sphotography.git
```

随后在 WordPress 后台激活主题即可。

---

## 快速开始

> **数据模型说明：** 地图标记来自**普通文章（post）**里带有位置信息的图片 —— 包括特色图片、上传到该文章的附件、以及正文中插入的图片。一张图片只有先出现在文章中、且带有经纬度，才会成为地图上的一枚标记。主题**不使用**独立的自定义文章类型。

### 1. 激活主题
激活后主题会自动：
- ✅ 注册 `region_tag` 地域标签分类法（挂载在原生文章上）
- ✅ 创建并应用「全屏地图」页面模板，设为静态首页

### 2. 让照片带上位置
在 **媒体库** 编辑任意图片：
- 点击 **「从图片读取 GPS/EXIF」** 自动提取坐标、相机型号与拍摄日期；
- 或手动填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| `latitude` | 纬度 | `28.228` |
| `longitude` | 经度 | `112.944` |
| `camera_info` | 相机参数（可选） | `Sony A7III · 24mm f/2.8` |
| `taken_at` | 拍摄日期（可选） | `2026-07-10` |

> 上传含 GPS 的原图时，坐标通常会在生成缩略图时**自动写入**，无需手动操作。

### 3. 撰写文章
在 **文章 → 新建** 中正常写作，插入上述带坐标的图片，按需勾选 **地域标签**。发布后：
- 文章出现在左侧边栏；
- 其中带坐标的图片自动成为地图标记；
- 桌面端点击标记照片 → 展开本文并定位到该图片段落。

### 4. 配置主题
进入 **主题全局配置**，调整主色、字体、卡片、日期格式、作者信息等。

---

## 主题配置

所有配置存于 WordPress `theme_mod`（`wp_options` 表），通过 `get_theme_mod()` 读写，并实时转译为前端 CSS 变量与 `body` class。

| # | 模块 | 关键项 |
|---|------|--------|
| ① | **全局主题** | 主色调（默认青绿 `#1abc9c`）+ 12 预设、允许前端自定义配色、沉浸式主题色、夜间模式（跟随系统 / 浅 / 暗）、深色方案（经典 / 蓝调 / 紫调）、前端字体（Noto Serif SC / WP 默认）、后台 Sphotography 风格 |
| ② | **卡片样式** | 圆角大小、阴影（浅 / 深） |
| ③ | **日期格式** | 7 种预设 + 自定义 PHP 格式 |
| ④ | **边栏信息** | 站点标题、默认展开边栏、文章卡片尺寸、一言格言开关、作者昵称 / 头像 / 简介 |
| ⑤ | **动画设置** | 平滑滚动、进场动画、Pjax 动画 |
| ⑥ | **页脚** | 自定义页脚 HTML |
| ⑦ | **CDN 来源** | jsDelivr / unpkg / cdnjs |
| — | **版本与更新** | 选择分支、检查更新、一键从分支更新 |

### 前端读取示例

```php
$primary = get_theme_mod( 'sphotography_primary_color', '#1abc9c' );
$radius  = get_theme_mod( 'sphotography_card_radius', 16 );
```

```js
SphotographySettings.nightMode      // 夜间模式
SphotographySettings.primaryColor   // 主色调
SphotographySettings.dateFormat     // 日期格式
```

### 内联数据回退

当 REST API 返回 403（被服务器拦截）时，前端自动改用 PHP 内联嵌入的数据：

```html
<script>var SphotographyInlineData = { photos: [ /* … */ ], posts: [ /* … */ ] };</script>
```

---

## 项目结构

```
sphotography/
├── style.css                    # 主题信息 + 全部 CSS（布局、毛玻璃、动画、响应式）
├── functions.php                # 后端引擎：分类法、EXIF 提取、REST 标记、资源加载、更新
├── index.php                    # WordPress 必需回退模板
├── template-map.php             # 全屏地图页面模板（HTML 骨架）
├── version.json                 # 版本信息 + 更新日志（供更新检查）
├── assets/js/
│   ├── app.js                   # 前端应用：地图、GeoJSON、交互、动画、状态管理
│   └── admin-settings.js        # 后台配置页交互
├── admin/
│   ├── theme-settings.php       # 主题全局配置页 UI + 保存 / 重置 / 更新逻辑
│   └── admin-style.php          # 后台 Sphotography 风格样式
├── inc/
│   └── theme-mods-applier.php   # PHP → 前端桥梁：CSS 变量、body class、内联数据
├── organization.md              # 宏观结构说明
└── README.md
```

---

## 数据流

```
WordPress 数据库                    前端地图
────────────────                    ────────
文章 + 正文/特色/附件图片
  └ 图片 latitude/longitude   ──▶  地图标记点（水滴）
  └ camera_info / taken_at    ──▶  详情面板元信息
  └ region_tag                ──▶  分类筛选 / 标签

媒体库上传 + EXIF
  └ 自动提取 GPS / 相机 / 日期 ──▶  标记点（被文章引用时）

主题全局配置
  └ 主色 / 夜间 / 圆角 / 字体   ──▶  CSS 变量 + body class
  └ 页脚 / CDN 来源            ──▶  页脚 HTML / enqueue URL

传输通道： REST API  ──(403 时回退)──▶  PHP 内联 SphotographyInlineData
```

---

## 更新

**后台一键更新**
1. 后台 → **主题全局配置 → 版本与更新**
2. 选择分支（通常 `master`）→ **检查更新** → **从该分支更新主题**

**手动更新**
1. 下载最新 Release 的 `sphotography.zip`
2. 通过 FTP 覆盖 `/wp-content/themes/sphotography/`，或删除旧主题后重装

> ⚠️ 所有配置存于数据库，更新主题文件不会丢失配置。

---

## 技术依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| [MapLibre GL JS](https://maplibre.org/) | 4.x | 地图渲染（含 GeoJSON 聚合） |
| [CartoDB Basemaps](https://carto.com/basemaps/) | — | 底图样式（Dark Matter / Positron） |
| [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) · [Noto Serif SC](https://fonts.google.com/specimen/Noto+Serif+SC) | — | 标题 / 正文衬线字体（Google Fonts） |
| WordPress | 5.x / 6.x | 内容管理与 REST API |

---

## 许可证

[GNU General Public License v2 or later](https://www.gnu.org/licenses/gpl-2.0.html)

---

<div align="center">

**Shirazu Nagisa**

[GitHub 仓库](https://github.com/ShirazuNagisa/sphotography) · [Releases](https://github.com/ShirazuNagisa/sphotography/releases) · [Issues](https://github.com/ShirazuNagisa/sphotography/issues)

</div>
