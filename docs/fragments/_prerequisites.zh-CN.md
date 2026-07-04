### 前置要求

KLineChart 需要股票数据后端支持。请确保 `kmap` 与 `stockbao` 处于同一目录下：

```
workspace/
├── KLineChartQuant/ # 本仓库
└── stockbao/    # 数据后端仓库
```

### 1. 克隆仓库

```bash
git clone https://github.com/363045841/KLineChartQuant.git
git clone https://github.com/363045841/stockbao.git
```

### 2. 启动数据后端

```bash
cd KLineChartQuant
npm run stockbao
```

后端启动后，API 地址为 `http://localhost:8000`
