const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(express.json());
app.use(cors());
let userCol;
const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.token_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};
const verifyHR = async (req, res, next) => {
  const email = req.token_email;

  if (!email) {
    return res.status(401).send({ message: "invalid token" });
  }

  try {
    const user = await userCol.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "user not found" });
    }

    if (user.role !== "hr") {
      return res.status(403).send({ message: "forbidden - HR only" });
    }

    next();
  } catch (error) {
    return res.status(500).send({ message: "server error" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.31jib4o.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("AssetVerse Server Running!");
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    const AssetVerseDB = client.db("AssetVerseDB");

    userCol = AssetVerseDB.collection("users");
    const assetCol = AssetVerseDB.collection("assets");
    const requestCol = AssetVerseDB.collection("requests");
    const packages = AssetVerseDB.collection("packages");
    const affiliationCol = AssetVerseDB.collection("affiliations");
    const assignedCol = AssetVerseDB.collection("assigneds");

    // --- CRUD ENDPOINTS ---

    // CREATE (All remaining POST endpoints)
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const result = await userCol.insertOne(newUser);
      res.send(result);
    });

    app.post("/assets", verifyFireBaseToken, verifyHR, async (req, res) => {
      const newAsset = req.body;
      const result = await assetCol.insertOne(newAsset);
      res.send(result);
    });

    app.post("/requests", verifyFireBaseToken, async (req, res) => {
      const newRequest = req.body;
      const result = await requestCol.insertOne(newRequest);
      res.send(result);
    });

    app.post(
      "/affiliations",
      verifyFireBaseToken,
      verifyHR,
      async (req, res) => {
        const newAffiliation = req.body;
        const result = await affiliationCol.insertOne(newAffiliation);
        res.send(result);
      }
    );

    app.post("/assigneds", verifyFireBaseToken, verifyHR, async (req, res) => {
      const newAssigned = req.body;
      const result = await assignedCol.insertOne(newAssigned);
      res.send(result);
    });

    // READ (All GET endpoints)
    app.get("/users", verifyFireBaseToken, async (req, res) => {
      const cursor = userCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/assets", verifyFireBaseToken, async (req, res) => {
      const { limit, skip, email } = req.query;
      const query = {};
      if (email) {
        query.email = email;
        if (email !== req.token_email) {
          return res.status(401).send({ message: "unauthorized access" });
        }
      }
      const cursor = assetCol
        .find(query)
        .limit(Number(limit))
        .skip(Number(skip));
      const result = await cursor.toArray();

      const count = await assetCol.countDocuments();
      res.send({ result, count });
    });

    app.get("/requests", verifyFireBaseToken, async (req, res) => {
      const cursor = requestCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/packages", async (req, res) => {
      const cursor = packages.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/affiliations", verifyFireBaseToken, async (req, res) => {
      const cursor = affiliationCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/assigneds", verifyFireBaseToken, async (req, res) => {
      const cursor = assignedCol.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // UPDATE (Request)
    app.patch(
      "/requests/:id",
      verifyFireBaseToken,
      verifyHR,
      async (req, res) => {
        const id = req.params.id;
        const updatedItem = req.body;
        const query = { _id: new ObjectId(id) };
        const update = { $set: updatedItem }; // Use $set directly on the body for flexibility
        const options = {};
        const result = await requestCol.updateOne(query, update, options);
        res.send(result);
      }
    );

    // --- HR LIMIT UPDATE (New Endpoint) ---
    app.patch(
      "/hr-limit/:email",
      verifyFireBaseToken,
      verifyHR,
      async (req, res) => {
        const email = req.params.email;
        const { employeeLimit } = req.body;
        const query = { email: email };
        const update = { $set: { packageLimit: employeeLimit } };
        const result = await userCol.updateOne(query, update);
        res.send(result);
      }
    );

    // DELETE (Affiliation, Assigneds)
    app.delete(
      "/affiliations/:id",
      verifyFireBaseToken,
      verifyHR,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await affiliationCol.deleteOne(query);
        res.send(result);
      }
    );

    app.delete(
      "/assigneds",
      verifyFireBaseToken,
      verifyHR,
      async (req, res) => {
        const { hrEmail, epEmail } = req.query;

        if (!hrEmail || !epEmail) {
          return res.status(400).send({ error: "Missing parameters" });
        }

        const query = {
          hrEmail: hrEmail.trim().toLowerCase(),
          epEmail: epEmail.trim().toLowerCase(),
        };

        const result = await assignedCol.deleteMany(query);
        res.send(result);
      }
    );

    // --- STRIPE PAYMENT INTEGRATION ---
    app.post(
      "/create-checkout-session",
      verifyFireBaseToken,
      verifyHR,
      async (req, res) => {
        const { packageName, price, hrEmail, employeeLimit } = req.body;

        if (!packageName || !price || !hrEmail || !employeeLimit) {
          return res
            .status(400)
            .send({ error: "Missing package payment information" });
        }

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: price * 100, // Stripe expects amount in cents
                product_data: {
                  name: `${packageName} Package`,
                },
              },
              quantity: 1,
            },
          ],
          // Pass payment data to the success URL via query parameters
          success_url: `${process.env.SITE_DOMAIN}/upgrade-success?session_id={CHECKOUT_SESSION_ID}&email=${hrEmail}&limit=${employeeLimit}`,
          cancel_url: `${process.env.SITE_DOMAIN}/packages?canceled=true`,
          customer_email: hrEmail,
          mode: "payment",
        });

        res.send({ url: session.url }); // Send the URL back to the client
      }
    );

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`AssetVerse Server listening on port ${port}`);
});
