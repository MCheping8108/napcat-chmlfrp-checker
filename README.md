# chmlfrp-checker

这是一个为napcat设计的插件，主要用于你的chmlfrp服务器的检测，还可以检测你的frp隧道是否在线。

## 使用方法
需要在**.env.template**文件中配置你的chmlfrp的token，然后重命名为**.env**文件。
下载插件后编译，dist目录是编译的产物，把它放到napcat的plugins目录下即可。
```bash
pnpm i && pnpm build
```

## 发送指令
- `ping <IP地址[:端口]> 或 ping <节点名称> 或 ping <节点名称> <端口号>`
- 例如：`ping 127.0.0.1:7000` 或 `ping my-node` 或 `ping my-node 7000`