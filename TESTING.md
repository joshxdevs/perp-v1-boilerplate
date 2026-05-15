# Testing Guide: Perp V1 API

This document provides a step-by-step sequence of `curl` commands to test every feature of the Perp V1 backend.

## 0. Preparation
Ensure your server is running:
```bash
bun --hot ./index.ts
```

---

## 1. User Management

### Signup a new user
```bash
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{"username": "josh", "password": 111111}'
```
*Expected: `{ "message": "User Created", "userId": 3 }`*

### Signin
```bash
curl -X POST http://localhost:3000/signin \
  -H "Content-Type: application/json" \
  -d '{"username": "josh", "password": 111111}'
```
*Expected: `{ "userId": 3 }`*

---

## 2. Collateral & Equity

### Deposit Funds (Onramp)
```bash
curl -X POST http://localhost:3000/onramp \
  -H "Content-Type: application/json" \
  -d '{"userId": 3, "amount": 5000}'
```
*Expected: `{ "message": "Funds added", "available": 5000 }`*

### Check Available Balance
```bash
curl "http://localhost:3000/equity/available?userId=3"
```
*Expected: `{ "available": 5000 }`*

---

## 3. Order Management

### Place a LONG Order
```bash
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 3,
    "market": "SOL",
    "type": "LONG",
    "qty": 10,
    "margin": 500,
    "orderType": "limit",
    "price": 90
  }'
```
*Expected: `{ "orderId": 13, "status": "open" }`*

### Place a SHORT Order
```bash
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 3,
    "market": "SOL",
    "type": "SHORT",
    "qty": 5,
    "margin": 250,
    "orderType": "limit",
    "price": 95
  }'
```

### Cancel an Order
Use the `orderId` you received from the previous steps (e.g., 13).
```bash
curl -X DELETE http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{"userId": 3, "orderId": 13}'
```
*Expected: `{ "message": "Order Cancelled", "available": 4500 }` (Balance restored)*

---

## 4. Data Retrieval

### Get All Orders for a Market
```bash
curl "http://localhost:3000/orders/SOL?userId=3"
```

### Get Only OPEN Orders
```bash
curl "http://localhost:3000/orders/open/SOL?userId=3"
```

### Get Open Positions
```bash
# Check harkirat's default positions (userId 1)
curl "http://localhost:3000/positions/open/SOL?userId=1"
```

### Get Trade Fills
```bash
# Get all fills in the system
curl "http://localhost:3000/fills"

# Get only your own fills
curl "http://localhost:3000/fills?userId=1"
```

---

## 5. Liquidation Logic (Internal)

To test the liquidation logic, you can temporarily add a trigger at the bottom of `index.ts`:

```ts
// Trigger: If price of SOL hits $79, harkirat's $80 position should wipe
onPriceUpdateFromBinance("SOL", 79);
```

Then check his position status:
```bash
curl "http://localhost:3000/positions/open/SOL?userId=1"
```
*Expected: `[]` (Position removed)*
