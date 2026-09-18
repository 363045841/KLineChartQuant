# 构建阶段
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm（使用阿里云镜像）
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm@12 && \
    pnpm config set registry https://registry.npmmirror.com

# 复制源代码
COPY . .

# 安装依赖（pnpm workspace：需带 pnpm-workspace.yaml 与各子包 manifest）
RUN pnpm install --frozen-lockfile

# 构建演示应用
RUN pnpm run build:demo

# 生产阶段
FROM nginx:alpine

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

RUN apk add --no-cache gettext

COPY devops/nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=builder /app/packages/vue/preview/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]