import express from "express"  //framework
import mongoose from "mongoose"
import dotenv from "dotenv"
import cors from 'cors'
import bcrypt from 'bcryptjs';  
import jwt from 'jsonwebtoken';

const app = express()
dotenv.config();

if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined in the environment variables");
    process.exit(1);
}


app.use(cors());

app.use(express.json());
const PORT = process.env.PORT || 7000;
const MONGOURL = process.env.MONGO_URL;

mongoose.connect(MONGOURL).then(()=>{
    console.log("Database is connected successfully")
    app.listen(PORT, ()=>{
        console.log(`server is running on port ${PORT}`)
    });
}).catch((error)=> console.log(error));

const OrderSchema = new mongoose.Schema({
    fname: String,
    lname: String,
    address: String,
    city: String,
    State: String,
    phone: String,
    email: String,
    product: Array,
    invoiceNo: Number, // Assuming you have this field as well
    orderedDate: { type: Date, required: true }, // Add this field
}, { timestamps: true, strict: false });


const OrderModel = mongoose.model("orders",OrderSchema)

const UserSchema = new mongoose.Schema({
    userName: { type:String , required :true, unique:true},
    password : {type :String , required:true}
    },{timestamps:true});

const UserModel = mongoose.model("users",UserSchema)

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await UserModel.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (password !== user.password) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ message: "Login successful", token });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
app.get("/getOrders", async(req,res)=>{
    console.log("req received")
    const userData = await OrderModel.find();
    res.json(userData);
})

app.put("/addOrder", async (req, res) => {
    const { invoiceNo, ...updateData } = req.body;
    
    try {
        // Attempt to update an existing order
        let updatedUser = await OrderModel.findOneAndUpdate(
            { invoiceNo },
            updateData,
            { new: true }
        );
        
        // If no existing order is found, create a new one
        if (!updatedUser) {
            console.log(`Order with invoiceNo ${invoiceNo} not found. Creating a new order.`);
            const newOrder = new OrderModel({ invoiceNo, ...updateData });
            updatedUser = await newOrder.save();
            return res.status(201).json({ message: "Order created successfully", updatedUser });
        }
        
        res.status(200).json({ message: "Order updated successfully", updatedUser });
    } catch (error) {
        console.error("Error during update or creation:", error.message);
        res.status(500).json({ message: error.message });
    }
});

app.get('/getLastOrder', async (req, res) => {
    try {
        const lastOrder = await OrderModel.findOne().sort({ invoiceNo: -1 });
        if (!lastOrder) {
            return res.status(200).json({ message: "No orders found" });
        }
        res.status(200).json(lastOrder);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


app.get('/getOrdersSummary', async (req, res) => {
    try {
        const totalOrders = await OrderModel.countDocuments();

        const pendingOrders = await OrderModel.countDocuments({ status: "Pending" });
        const inProgressOrders = await OrderModel.countDocuments({ status: "In progress" });
        const completedOrders = await OrderModel.countDocuments({ status: "Completed" });

        res.status(200).json({
            totalOrders: totalOrders,
            pendingOrders: pendingOrders,
            inProgressOrders: inProgressOrders,
            completedOrders: completedOrders
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/getCustomerDetails',async (req,res)=>{
    try{
        const customers = await OrderModel.aggregate([
            {
                $group: {
                    _id: "$phone",
                    fname: { $first: "$fname" },
                    lname: { $first: "$lname" },
                    phone: { $first: "$phone" },
                    email: { $first: "$email" },
                    orderCount: { $sum: 1 }
                }
            }
        ]);
        res.status(200).json(customers)
    }catch(error){
        res.status(500).json({message : error.message})
    }
    
})
app.get('/getOrderDetails',async(req,res)=>{
    const phone = req.query.phone;
    if(!phone){
        return res.status(400).json({message : "phone no is req"});
    }
    try{
        const orders = await OrderModel.find({phone:phone});
        if (!orders.length){
            return res.status(404).json({message : "No orders found for this phone"});
        }
        res.status(200).json(orders)
    }catch(error){
        res.status(500).json({message : error.message})
    }
});

app.get('/getRecentOrders' ,async(req,res)=>{
    try{
        const recentOrders = await OrderModel.find()
            .sort({orderedDate:-1,_id:-1})
            .limit(5)
        res.status(200).json(recentOrders)
    }catch(error){
        res.status(500).json({message: error.message})
    }
})

app.get('/bestSelling',async(req,res)=>{
    try{
        const prod = await OrderModel.aggregate([
            {$unwind:"$product"},
            {
                $group:{
                    _id:"$product.name",
                    totsales:{$sum : "$product.quantity"}
                }
            },
            {$sort:{totalSold : -1}}
        ]);

        const totalSales = prod.reduce((acc,prod)=>acc+prod.totsales,0);
        const percent = prod.map(product=>({
            name:product._id,
            totalSold: product.totsales,
            percentage : ((product.totsales/totalSales)*100).toFixed(2)
        }));
        percent.sort((a, b) => b.percentage - a.percentage);

        res.status(200).json(percent);
    }catch(error){
        res.status(500).json({message : error.message})
    }
    
})