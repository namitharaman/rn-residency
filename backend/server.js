require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();


// ---------- Middleware ----------
app.use(express.json());
app.use(cors({ origin: "*" }));

// ---------- Configuration ----------
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/rn_residency";

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing in .env file");
  process.exit(1);
}

// ---------- MongoDB Connection ----------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ---------- User Schema ----------
const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ---------- Login Schema ----------
const loginSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true }
});

const Login = mongoose.model("Login", loginSchema);

// ---------- Register Route ----------
app.post("/api/register", async (req, res) => {
  try {
    console.log("📥 Registration data:", req.body);

    const { fullName, phone, email, password } = req.body;

    if (!fullName || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
        receivedData: req.body
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Save full profile in users collection
    const newUser = new User({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword
    });
    await newUser.save();
    console.log("✅ User saved successfully:", newUser);

    // Save credentials in login collection
    const newLogin = new Login({
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password: hashedPassword
    });
    await newLogin.save();
    console.log("✅ Login record saved successfully:", newLogin);

    res.status(201).json({ success: true, message: "Account created successfully" });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: error.message
    });
  }
});
// ---------- Login Route ----------
app.post("/api/login", async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Require either email or phone + password
    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        message: "Email or phone and password are required"
      });
    }

    // Find user in login collection
    const loginUser = await Login.findOne({
      $or: [
        { email: email?.toLowerCase().trim() },
        { phone: phone?.trim() }
      ]
    });

    if (!loginUser) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    // Compare entered password with hashed password
    const isMatch = await bcrypt.compare(password, loginUser.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: loginUser._id, email: loginUser.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        email: loginUser.email,
        phone: loginUser.phone
      }
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
      error: error.message
    });
  }
});


// ---------- Bill Schema ----------
const billSchema = new mongoose.Schema(
  {
    flatNumber: { type: String, required: true, trim: true },
    residentName: { type: String, required: true, trim: true },
    billingMonth: { type: String, required: true, trim: true },
    elecPrev: Number,
    elecCurr: Number,
    elecRate: Number,
    elecUnits: Number,
    elecTotal: Number,
    waterPrev: Number,
    waterCurr: Number,
    waterRate: Number,
    waterUnits: Number,
    waterTotal: Number,
    grandTotal: { type: Number, required: true }
  },
  { timestamps: true }
);

const Bill = mongoose.model("Bill", billSchema);

// ---------- Bill Calculation Route ----------
app.post("/api/bills/calculate", async (req, res) => {
  try {
    const {
      flatNumber,
      residentName,
      billingMonth,
      elecPrev,
      elecCurr,
      elecRate,
      waterPrev,
      waterCurr,
      waterRate
    } = req.body;

    const electricityUnits = Math.max(0, Number(elecCurr) - Number(elecPrev));
    const electricityTotal = electricityUnits * Number(elecRate);

    const waterUnits = Math.max(0, Number(waterCurr) - Number(waterPrev));
    const waterTotal = waterUnits * Number(waterRate);

    const grandTotal = electricityTotal + waterTotal;

    const newBill = new Bill({
      flatNumber,
      residentName,
      billingMonth,
      elecPrev,
      elecCurr,
      elecRate,
      elecUnits: electricityUnits,
      elecTotal: electricityTotal,
      waterPrev,
      waterCurr,
      waterRate,
      waterUnits,
      waterTotal,
      grandTotal
    });

    await newBill.save();

    res.status(201).json({
      success: true,
      message: "Bill saved successfully!",
      bill: newBill
    });
  } catch (error) {
    console.error("❌ Bill saving error:", error);
    res.status(500).json({ success: false, message: "Error saving bill." });
  }
});


// ---------- Test Route ----------
app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "RN Residency backend is working!" });
});
// ---------- Root Route ----------
app.get("/", (req, res) => {
  res.send("Welcome to RN Residency Backend!");
});

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
