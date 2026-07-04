### Prerequisites

KLineChart requires a stock data backend. Please ensure `kmap` and `stockbao` are in the same directory:

```
workspace/
├── KLineChartQuant/ # This repository
└── stockbao/    # Data backend repository
```

### 1. Clone Repositories

```bash
git clone https://github.com/363045841/KLineChartQuant.git
git clone https://github.com/363045841/stockbao.git
```

### 2. Start Data Backend

```bash
cd KLineChartQuant
npm run stockbao
```

After startup, the API is available at `http://localhost:8000`
