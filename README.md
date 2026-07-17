# Sphotography — ip-data 分支

本 orphan 分支仅存放供 Sphotography 主题「评论 IP 属地」功能按需下载的离线 IP 库。

- `ip2region.xdb` — 来自 [lionsoul2014/ip2region](https://github.com/lionsoul2014/ip2region) 的 `data/ip2region_v4.xdb`（IPv4，xdb 格式，Apache-2.0）。

主题在后台开启「显示评论者 IP 属地」后，会通过 jsDelivr 从本分支按需下载该文件到 `wp-content/uploads/sphotography-ip/`，在服务器本地解析，不随主题包分发（与 `geo-data` 分支的边界数据同理）。
