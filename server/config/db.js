const mongoose = require('mongoose');
mongoose.set('strictQuery', false);
const connectDB = (async() => {
    try{
        const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI;
        const conn = await mongoose.connect(mongoUri);
        console.log(`Database Connected: ${conn.connection.host}`)
    }catch(error){
        console.log(error);
    }
});

module.exports = connectDB;