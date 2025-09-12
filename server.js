import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from 'stripe';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PAYPAL_API = process.env.PAYPAL_API;
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_SECRET;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const categories = {
  albums: {
    1: { name: "Album A", price: 15.0 },
    2: { name: "Album B", price: 20.0 },
    3: { name: "Album B", price: 20.0 },
    4: { name: "Album B", price: 20.0 },
  },
  products: {
    1: { name: "Producto X", price: 10.0 },
    2: { name: "Producto Y", price: 12.0 },
  },
  merch: {
    1: { name: "Camiseta", price: 25.0 },
    2: { name: "Gorra", price: 15.0 },
  },
};


// Stripe:

app.post("/api/stripe", async (req, res) => {
  try {
    const { category, productId } = req.body;

    const product = categories[category]?.[productId];
    if (!product) {
      return res.status(400).json({ error: "Producto no encontrado" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: product.name },
            unit_amount: Math.round(product.price * 100),
          },
          quantity: 1,
        },
      ],
      customer_creation: 'always',
      success_url: `https://artist-client-m7h7.vercel.app/Payments?id=${productId}&status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://artist-client-m7h7.vercel.app/Payments?id=${productId}&status=cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error en Stripe:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/session/:id', async (req,res) => {
  try{
    const session = await stripe.checkout.sessions.retrieve(req.params.id, {
      expand: ['customer_details','line_items','payment_intent'],
    });


    // validar si el pago fué hecho:
    if(session.payment_status !== 'paid'){
      return res.status(400).json({error:'pago no procesadu'})
    }

    res.json(session);
  } catch(error){
    console.error(error);
    res.status(500).json({error: 'no se recuperó la sesión'})
  }
});


// Paypal Payments:

async function generateAccessToken() {
  const response = await axios({
    url: `${PAYPAL_API}/v1/oauth2/token`,
    method: "post",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    auth: { username: CLIENT_ID, password: CLIENT_SECRET },
    data: "grant_type=client_credentials",
  });
  return response.data.access_token;
}

// Crear orden
app.post("/create-order", async (req, res) => {
  try {
    const {category, productId } = req.body
    const product = categories[category]?.[productId];
    if (!product) return res.status(400).send("Producto no válido");

    const accessToken = await generateAccessToken();

    const response = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            description: product.name,
            amount: { currency_code: "USD", value: product.price },
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json({ id: response.data.id });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creando la orden");
  }
});

// Capturar pago
app.post("/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;
    const accessToken = await generateAccessToken();

    const response = await axios.post(
      `${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error capturando el pago");
  }
});




app.listen(5000, () => console.log("Servidor backend en http://localhost:5000"));