const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const indinf = new Schema({
    value: [{
        type: Number,
        required: true
    }]
});
  
const MealsSchema = new Schema({

    user: {
        type: Schema.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: true,
    },
    image:{
        type: String,
        required: true,
    },
    ingredients:[{
        type: String,
        required: true
    }],
    ninf:[{
        type: indinf,
        required: true
    }],
    netinf:[{
        type: Number,
        required: true
    }],
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

module.exports = mongoose.model('Meals', MealsSchema);