# Deployment Guide — AWS (Amazon HackOn)

## Architecture

```
Frontend  →  AWS Amplify        (React build, CDN, HTTPS)
Backend   →  AWS EC2            (Node.js + PM2, no Docker required)
Images    →  AWS S3 + CloudFront (387 product images, global CDN)
Database  →  MongoDB Atlas      (hosted on AWS ap-south-1)
AI        →  Groq API           (Llama 3.1-8b-instant)
```

---

## Option A — Deploy Backend to EC2 (Recommended — No Docker Needed)

### A.1 Launch EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. OS: **Ubuntu 24.04 LTS**
3. Instance type: `t2.micro` or `t3.micro`
4. Create a key pair (e.g., `hackon-key.pem`) and download it
5. Security Group — open these ports:
   - SSH (22)
   - HTTP (80)
   - Custom TCP: **3001** (from `0.0.0.0/0`)

### A.2 SSH into EC2

```bash
chmod 400 hackon-key.pem
ssh -i hackon-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### A.3 Install Node.js & PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

### A.4 Clone & Configure

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO/backend

# Create .env from the example
cp .env.example .env
nano .env
```

Fill in your real values (MongoDB URI, Groq key, AWS credentials, etc.).

### A.5 Install, Build & Start

```bash
npm install
npm run build
pm2 start dist/index.js --name "amazon-now-backend"
pm2 save
pm2 startup  # auto-start on server reboot
```

### A.6 Test it

```bash
curl http://YOUR_EC2_PUBLIC_IP:3001/health
# → {"status":"ok","time":"..."}
```

---

## Option B — Deploy Backend via Docker to App Runner

> Use this only if you prefer a fully managed container approach.

### B.1 Push Docker image to Amazon ECR

```bash
aws ecr create-repository --repository-name amazon-now-backend --region ap-south-1

aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.ap-south-1.amazonaws.com

cd backend
docker build -t amazon-now-backend .
docker tag amazon-now-backend:latest 123456789.dkr.ecr.ap-south-1.amazonaws.com/amazon-now-backend:latest
docker push 123456789.dkr.ecr.ap-south-1.amazonaws.com/amazon-now-backend:latest
```

### B.2 Create App Runner Service

1. Go to **AWS Console → App Runner → Create service**
2. Source: **Container registry → Amazon ECR**
3. Port: **3001**, Health check: `/health`
4. Add Environment Variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `MONGO_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/amazon-now` |
| `GROQ_API_KEY` | `gsk_...` |
| `GROQ_MODEL` | `llama-3.1-8b-instant` |
| `AWS_ACCESS_KEY_ID` | Your IAM key |
| `AWS_SECRET_ACCESS_KEY` | Your IAM secret |
| `AWS_REGION` | `ap-south-1` |
| `S3_MEDIA_BUCKET` | `amzn-now-hackon` |
| `CLOUDFRONT_URL` | `https://d124nq9cpdz5ld.cloudfront.net` |

---

## Part 2 — Seed the Database

Run once against your production MongoDB:

```bash
cd backend
MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/amazon-now" npm run seed
```

---

## Part 3 — Deploy Frontend to AWS Amplify

### 3.1 Set production environment variables

Edit `frontend/.env.production`:
```env
VITE_CDN_URL=https://d124nq9cpdz5ld.cloudfront.net
VITE_API_URL=http://YOUR_EC2_PUBLIC_IP:3001/api
```

### 3.2 Connect via Amplify Console

1. Go to **AWS Console → Amplify → New app → Host web app**
2. Connect your **GitHub repository**, branch: `main`
3. Build settings (Amplify auto-detects Vite):

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend && npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*
```

4. Add **Environment Variables** in Amplify console:
   - `VITE_CDN_URL` = `https://d124nq9cpdz5ld.cloudfront.net`
   - `VITE_API_URL` = `http://YOUR_EC2_PUBLIC_IP:3001/api`

5. Click **Save and deploy**

### 3.3 Update CORS on backend

Add your Amplify URL to the `FRONTEND_URL` env var on EC2:
```bash
# On EC2, edit .env:
FRONTEND_URL=https://main.abcdef.amplifyapp.com

# Rebuild and restart
npm run build && pm2 restart amazon-now-backend
```

---

## Part 4 — Images (S3 + CloudFront)

Product images are already uploaded to S3 and served via CloudFront. No action needed.

To re-upload if needed:
```bash
aws s3 sync frontend/public/images/products s3://amzn-now-hackon/products/ \
  --region ap-south-1 \
  --cache-control "public, max-age=31536000"
```

---

## Quick Reference After Deploy

| Service | URL |
|---------|-----|
| Frontend | `https://main.abcdef.amplifyapp.com` |
| Backend API | `http://YOUR_EC2_IP:3001/api` |
| Health check | `http://YOUR_EC2_IP:3001/health` |
| Image CDN | `https://d124nq9cpdz5ld.cloudfront.net/products/` |

---

## Cost Estimate

| Service | Cost |
|---------|------|
| AWS EC2 t2.micro | Free tier — 750 hrs/month |
| AWS Amplify | Free tier — 1000 build mins/month |
| AWS S3 + CloudFront | Near zero for hackathon traffic |
| MongoDB Atlas M0 | Free forever (512 MB) |

**Total cost for hackathon demo: ~$0**
