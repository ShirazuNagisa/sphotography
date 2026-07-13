# Sphotography

全屏地图式摄影主题 · A fullscreen map-based photography theme for WordPress

将 WordPress 变为一个纯粹的内容管理后台，前端完全呈现为一张可探索的地图。访客进入网站即看到一个占据整个视口的暗色/浅色地图，照片作为可点击的标记散布其上。

---

## 功能特性

### 前端体验
- **🗺️ 全屏地图** — 基于 MapLibre GL JS，CartoDB 底图（暗色 Dark Matter / 浅色 Positron，跟随系统或手动设置）
- **📍 照片标记点** — 白色填充圆点 + 橙色边框，点击弹出照片网格
- **📂 左侧边栏** — 可展开/收起，显示最近文章列表，支持搜索过滤
- **📄 文章面板** — 点击文章卡片加载完整 WordPress 文章内容
- **🖼️ 照片网格** — 点击地图标记点显示 3 列照片网格，点击照片查看详情
- **🔍 点聚合** — 基于 supercluster，照片密集区域自动聚合显示数量
- **👤 作者浮层** — 右下角信息按钮，显示头像、昵称、简介、一言格言
- **📱 响应式布局** — 桌面端/平板/移动端三断点适配

### 视觉效果
- **毛玻璃面板** — 高斯模糊亚克力材质，半透明背景
- **暗色主题** — 低饱和度配色，暖橙强调色 `#e67e22`
- **平滑动画** — 面板展开/收起过渡 0.35s ease
- **Playfair Display 标题字体** — 优雅衬线字体

### 后台管理
- **主题全局配置页面** — 独立顶级菜单，5 大配置模块
  - 全局主题：主色调拾取器 + 12 预设色、夜间模式、深色方案
  - 卡片样式：圆角大小、阴影样式
  - 日期格式：7 种预设 + 自定义 PHP 格式
  - 左侧栏信息：站点标题、一言格言、作者昵称、头像、简介
  - 动画设置：平滑滚动、文章进场动画、Pjax 动画
- **GitHub 更新检查** — 选择分支、检查 Release、一键更新

### 技术栈
- WordPress 自定义文章类型 `photograph` + 自定义分类法 `region_tag`
- MapLibre GL JS v4+（开源地图库，无需 API Token）
- CartoDB Dark Matter / Positron 底图
- WordPress REST API（含内联数据回退，解决 403 问题）
- Supercluster 点聚合
- 纯原生 JavaScript（无前端框架依赖）

---

## 安装

### 方式一：从 GitHub Release 安装（推荐）

1. 访问 [Releases 页面](https://github.com/ShirazuNagisa/sphotography/releases)
2. 下载最新版本的 `sphotography.zip`
3. 登录 WordPress 后台 → **外观 → 主题 → 安装主题 → 上传**
4. 选择 `sphotography.zip`，点击 **现在安装**
5. 安装完成后点击 **启用**

### 方式二：从 GitHub 克隆

```bash
cd wp-content/themes/
git clone https://github.com/ShirazuNagisa/sphotography.git
```

然后在 WordPress 后台激活主题。

---

## 快速开始

### 1. 激活主题
激活后主题会自动：
- ✅ 注册 `photograph` 自定义文章类型
- ✅ 注册 `region_tag` 自定义分类法
- ✅ 创建 "Photography Map" 页面并应用 Fullscreen Map 模板
- ✅ 将该页面设为静态首页

### 2. 添加照片
进入 WordPress 后台 → **Photographs → 新建**：

| 字段 | 说明 | 示例 |
|------|------|------|
| 标题 | 照片名称 | 城市日落 |
| 内容 | 照片描述 | 傍晚在湘江边拍摄的落日余晖 |
| 特色图片 | 上传照片 | JPG / PNG |
| 地域标签 | Region Tags | 城市, 日落 |
| latitude | 纬度 | 28.228 |
| longitude | 经度 | 112.944 |
| camera_info | 相机参数（可选） | Sony A7III · 24mm f/2.8 |
| taken_at | 拍摄日期（可选） | 2026-07-10 |

### 3. 添加文章
进入 WordPress 后台 → **文章 → 新建**，撰写常规 WordPress 文章。文章会自动显示在左侧边栏列表中。

### 4. 配置主题
进入 WordPress 后台 → **主题全局配置**，调整主题色、卡片样式、日期格式等。

---

## 配置管理

主题的所有配置存储在 WordPress 的 `theme_mod` 中（数据库 `wp_options` 表），通过 `get_theme_mod()` / `set_theme_mod()` 读写。

### 前端读取示例

```php
// 获取主色调
$primary_color = get_theme_mod( 'sphotography_primary_color', '#e67e22' );

// 获取卡片圆角
$card_radius = get_theme_mod( 'sphotography_card_radius', 16 );
```

### JS 配置对象

前端 JS 可通过 `SphotographySettings` 对象获取配置：

```js
SphotographySettings.nightMode      // 夜间模式
SphotographySettings.primaryColor   // 主色调
SphotographySettings.dateFormat     // 日期格式
```

### 内联数据回退

当 REST API 返回 403 时（服务器拦截），JS 会自动使用 PHP 内联嵌入的数据：

```html
<script>var SphotographyInlineData = { photos: [...], posts: [...] };</script>
```

---

## 主题结构

```
sphotography/
├── style.css                  # 主题信息 + 全部 CSS 样式
├── functions.php              # 后端逻辑（CPT、REST API、配置、更新）
├── index.php                  # WordPress 必需回退模板
├── template-map.php           # 全屏地图页面模板
├── assets/
│   └── js/
│       └── app.js             # 前端交互脚本
├── inc/
│   └── theme-mods-applier.php # CSS 变量输出 + body class + 内联数据
├── admin/
│   └── theme-settings.php     # 主题全局配置页面
└── README.md
```

---

## 更新

### 方式一：后台一键更新
1. WordPress 后台 → **主题全局配置 → 版本与更新**
2. 选择分支（通常为 `master`）
3. 点击 **检查更新**
4. 点击 **从该分支更新主题**

### 方式二：手动更新
1. 下载最新 Release 的 `sphotography.zip`
2. 通过 FTP 覆盖 `/wp-content/themes/sphotography/` 目录
3. 或删除旧主题后重新安装

> ⚠️ 所有配置数据存储在数据库中，更新主题文件不会丢失配置。

---

## 技术依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| [MapLibre GL JS](https://maplibre.org/) | 4.x | 地图渲染 |
| [CartoDB basemaps](https://carto.com/basemaps/) | - | 底图样式（Dark Matter / Positron） |
| [supercluster](https://github.com/mapbox/supercluster) | 8.x | 点聚合 |
| [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) | - | 标题字体（Google Fonts） |
| WordPress | 5.x / 6.x | 内容管理系统 |

---

## 许可证

GNU General Public License v2 or later

---

## 作者

**Shirazu Nagisa** 

---

## 链接

- [GitHub 仓库](https://github.com/ShirazuNagisa/sphotography)
- [Releases](https://github.com/ShirazuNagisa/sphotography/releases)
- [Issues](https://github.com/ShirazuNagisa/sphotography/issues)