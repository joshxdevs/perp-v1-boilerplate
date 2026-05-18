import express from "express";

const app = express();
app.use(express.json());

const users = [{
    userId: 1,
    username: "harkirat",
    password: 123123,
    collateral: {
        availabe: 2000,
        locked: 1000
    },
    positions: [
        { market: "SOL", type: "LONG", qty: 10, margin: 500, liquidationPrice: 80, averagePrice: 90 },
        { market: "ETH", type: "SHORT", qty: 1, margin: 500, liquidationPrice: 2000, averagePrice: 1900 }
    ],
    orders: [
        { orderId: 1, market: "SOL", type: "LONG", qty: 10, margin: 500, orderType: "limit", price: 90, status: "filled" },
        { orderId: 2, market: "ETH", type: "SHORT", qty: 10, margin: 500, orderType: "limit", price: 1900, status: "filled" },
        { orderId: 3, market: "BTC", type: "LONG", qty: 10, margin: 500, orderType: "limit", price: 1900, status: "cancelled" },
    ]
}, {
    userId: 2,
    username: "raman",
    password: 123123,
    collateral: {
        availabe: 2000,
        locked: 2000
    },
    positions: [
        { market: "SOL", type: "SHORT", qty: 10, margin: 1000, liquidationPrice: 80, pnL: 200, averagePrice: 90 },
        { market: "ETH", type: "LONG", qty: 1, margin: 1000, liquidationPrice: 2000, pnL: -100, averagePrice: 1900 }
    ],
    orders: [
        { orderId: 10, market: "SOL", type: "SHORT", qty: 10, margin: 500, orderType: "market", price: 90, status: "filled" },
        { orderId: 11, market: "ETH", type: "LONG", qty: 10, margin: 500, orderType: "market", price: 1900, status: "filled" },
        { orderId: 12, market: "ZEC", type: "LONG", qty: 10, margin: 500, orderType: "limit", price: 1900, status: "open" },
    ]
}];

type Bid = {
    availableQty: number,
    openOrders: { userId: number, qty: number, filledQty: number, orderId: number, createdAt: Date }[]
}

type Orderbook = {
    bids: Record<string, Bid>,
    asks: Record<string, Bid>,
    lastTradedPrice: number,
    indexPrice: number
}

type Orderbooks = Record<string, Orderbook>

const orderbooks: Orderbooks = {
    SOL: { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01 },
    ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 }
}

const fills = [{
    maker: 1,
    taker: 2,
    market: "SOL",
    qty: 10,
    price: 90,
    long: 1,
    short: 2
}, {
    maker: 1,
    taker: 2,
    market: "ETH",
    qty: 1,
    price: 1900,
    long: 2,
    short: 1
}];

app.post("/signup", (req, res) => {
    const { username, password } = req.body;
    const existing = users.find(u => u.username === username)
    if (existing) {
        return res.status(400).json({ message: "Username already taken" })
    }

    const newUser = {
        userId: users.length + 1,
        username,
        password,
        collateral: { availabe: 0, locked: 0 },
        positions: [],
        orders: []
    }
    users.push(newUser)
    res.json({
        message: "User Created",
        userId: newUser.userId
    })
})


app.post("/signin", (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username && u.password === password)
    if (!user) {
        return res.status(401).json({
            message: "Invalid Credentials"
        })
    }
    res.json({
        userId: user.userId
    })
})


app.post("/onramp", (req, res) => {
    const { userId, amount } = req.body
    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }
    user.collateral.availabe += amount
    res.json({
        message: "Funds added",
        available: user.collateral.availabe
    })

})

app.post("/order", (req, res) => {
    const { userId, market, type, qty, margin, orderType, price } = req.body;

    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }

    if (user.collateral.availabe < margin) {
        return res.status(400).json({
            message: "Insufficient Collateral"
        })
    }

    user.collateral.availabe -= margin;
    user.collateral.locked += margin;

    const allOrders = users.flatMap(u => u.orders)
    const newOrderId = allOrders.length > 0 ? Math.max(...allOrders.map(o => o.orderId)) + 1 : 1

    const newOrder = {
        orderId: newOrderId,
        market,
        type,
        qty,
        margin,
        orderType,
        price,
        status: "open"
    }
    user.orders.push(newOrder)

    if (!orderbooks[market]) {
        orderbooks[market] = { bids: {}, asks: {}, lastTradedPrice: price, indexPrice: price }
    }

    const priceKey = String(price)

    let remainingQty = qty;

    const oppositeSide = type === "LONG" ? orderbooks[market].asks : orderbooks[market].bids
    if (oppositeSide[priceKey]) {
        const restingOrders = oppositeSide[priceKey].openOrders

        for (let i = 0; i < restingOrders.length && remainingQty > 0; i++) {
            const restingOrder = restingOrders[i]
            const matchQty = Math.min(remainingQty, restingOrder!.qty - restingOrder!.filledQty)

            if (matchQty > 0) {
                fills.push({
                    maker: restingOrder!.userId,
                    taker: userId,
                    market,
                    qty: matchQty,
                    price,
                    long: type === "LONG" ? userId : restingOrder!.userId,
                    short: type === "SHORT" ? userId : restingOrder!.userId
                })
                remainingQty -= matchQty
                restingOrder!.filledQty += matchQty

                if (restingOrder!.filledQty === restingOrder!.qty) {
                    const makerUser = users.find(u => u.userId === restingOrder!.userId)
                    if (makerUser) {
                        const makerOrder = makerUser.orders.find(o => o.orderId === restingOrder!.orderId)
                        if (makerOrder) {
                            makerOrder.status = "filled"
                        }
                    }
                }
            }
        }
        oppositeSide[priceKey].openOrders = restingOrders.filter(o => o.filledQty < o.qty)
        oppositeSide[priceKey].availableQty -= (qty - remainingQty)
        if (oppositeSide[priceKey].openOrders.length === 0) {
            delete oppositeSide[priceKey]
        }
    }
    if (remainingQty === 0) {
        newOrder.status = "filled"
    }

    if (remainingQty > 0) {
        if (type === "LONG") {
            if (!orderbooks[market].bids[priceKey]) {
                orderbooks[market].bids[priceKey] = { availableQty: 0, openOrders: [] }
            }
            orderbooks[market].bids[priceKey].availableQty += qty;
            orderbooks[market].bids[priceKey].openOrders.push({
                userId,
                qty: remainingQty,
                filledQty: 0,
                orderId: newOrderId,
                createdAt: new Date()
            })
        } else {
            if (!orderbooks[market].asks[priceKey]) {
                orderbooks[market].asks[priceKey] = { availableQty: 0, openOrders: [] }
            }
            orderbooks[market].asks[priceKey].availableQty += qty;
            orderbooks[market].asks[priceKey].openOrders.push({
                userId,
                qty: remainingQty,
                filledQty: 0,
                orderId: newOrderId,
                createdAt: new Date()
            })
        }
    }
    res.json({
        orderId: newOrderId,
        status: newOrder.status
    })
})


app.delete("/order", (req, res) => {
    const { userId, orderId } = req.body

    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(401).json({
            message: "User not found"
        })
    }

    const order = user.orders.find(o => o.orderId === orderId)
    if (!order) {
        return res.status(404).json({
            message: "Order not found"
        })
    }

    if (order.status !== "open") {
        return res.status(400).json({
            message: "Order is not open, cannot cancel"
        })
    }

    order.status = "cancelled";

    user.collateral.locked -= order.margin
    user.collateral.availabe += order.margin

    const market = orderbooks[order.market]
    if (market) {
        const side = order.type === "LONG" ? market.bids : market.asks
        const priceKey = String(order.price)
        if (side[priceKey]) {
            side[priceKey].openOrders = side[priceKey].openOrders.filter(o => o.orderId !== orderId)
            side[priceKey].availableQty -= order.qty
            if (side[priceKey].openOrders.length === 0) {
                delete side[priceKey]
            }
        }
    }

    res.json({
        message: "Order Cancelled",
        available: user.collateral.availabe
    })

})


app.get("/equity/available", (req, res) => {
    const userId = Number(req.query.userId)

    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }
    res.json({
        available: user.collateral.availabe
    })
})


app.get("/positions/open/:marketId", (req, res) => {
    const userId = Number(req.query.userId)
    const { marketId } = req.params

    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }
    const openPositions = user.positions.filter(o => o.market === marketId)
    res.json(openPositions)
})


app.get("/positions/closed/:marketId", (req, res) => {
    res.json([])
})


app.get("/orders/open/:marketId", (req, res) => {
    const userId = Number(req.query.userId)
    const { marketId } = req.params

    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }
    const openOrders = user.orders.filter(o => o.market === marketId && o.status === "open")
    res.json(openOrders)
})


app.get("/orders/:marketId", (req, res) => {
    const userId = Number(req.query.userId)
    const { marketId } = req.params

    const user = users.find(u => u.userId === userId)
    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }

    const marketOrders = user.orders.filter(o => o.market === marketId)
    res.json(marketOrders)
})


app.get("/fills", (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : null

    if (userId !== null) {
        const userFills = fills.filter(f => f.maker === userId || f.taker === userId)
        res.json(userFills)
    } else {
        res.json(fills)
    }
});

async function liqudationChecks(asset: string, price: number) {
    for (const user of users) {
        const positionsToCheck = user.positions.filter(p => p.market === asset)
        for (const position of positionsToCheck) {
            let shouldLiquidate = false;
            if (position.type === "LONG" && price <= position.liquidationPrice) {
                shouldLiquidate = true;
            }
            if (position.type === "SHORT" && price >= position.liquidationPrice) {
                shouldLiquidate = true;
            }
            if (shouldLiquidate) {
                console.log(`LIQUIDATING: userId=${user.userId}, market=${asset}, type=${position.type}, at price=${price}`)
                user.collateral.locked -= position.margin
                user.positions = user.positions.filter(p => p !== position)
            }
        }
    }
}


async function onPriceUpdateFromBinance(asset: string, price: number) {
    liqudationChecks(asset, price);
}

app.listen(3000, () => {
    console.log("Server running on port 3000")
})