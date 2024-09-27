require('dotenv').config();

const Meal = require('../models/Meals');
const mongoose = require('mongoose');
const path = require('path')
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs=require("fs");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);


exports.dashboard = async (req, res) => {


    // try{

    //     await Meal.insertMany([
    //         {
    //             user: "66f516a9cb475ccf0bfe0ebf",  // Randomly generated ObjectId
    //             name: "Pasta",
    //             image: "uploads/pasta.jpg",
    //             ingredients: ["Wheat", "Tomato Sauce", "Cheese"],
    //             ninf: [
    //                 { value: [350, 12, 2, 74, 4, 1, 5] },  // Wheat (per 100g)
    //                 { value: [80, 2, 3, 18, 2, 5, 200] },  // Tomato Sauce (per 100g)
    //                 { value: [402, 25, 33, 1.3, 0, 0.4, 621] }  // Cheese (per 100g)
    //             ],
    //             netinf: [832, 39, 38, 93.3, 6, 6.4, 826],  // Total nutritional info for the dish
    //             createdAt: new Date()
    //         },
    //         {
    //             user: "66f516a9cb475ccf0bfe0ebf",
    //             name: "Salad",
    //             image: "uploads/salad.jpg",
    //             ingredients: ["Lettuce", "Tomato", "Cucumber"],
    //             ninf: [
    //                 { value: [15, 1, 0.2, 3.3, 1.5, 0.6, 10] },  // Lettuce (per 100g)
    //                 { value: [18, 0.9, 0.2, 3.9, 1.2, 2.6, 5] },  // Tomato (per 100g)
    //                 { value: [16, 0.7, 0.1, 3.6, 0.5, 1.7, 2] }   // Cucumber (per 100g)
    //             ],
    //             netinf: [49, 2.6, 0.5, 10.8, 3.2, 4.9, 17],  // Total nutritional info for the salad
    //             createdAt: new Date()
    //         },
    //         {
    //             user: "66f516a9cb475ccf0bfe0ebf",
    //             name: "Chicken Sandwich",
    //             image: "uploads/chicken-sandwich.jpg",
    //             ingredients: ["Chicken", "Bread", "Lettuce"],
    //             ninf: [
    //                 { value: [239, 27, 14, 0, 0, 0, 82] },  // Chicken (per 100g)
    //                 { value: [265, 9, 3.2, 49, 2.4, 5.5, 491] },  // Bread (per 100g)
    //                 { value: [15, 1, 0.2, 3.3, 1.5, 0.6, 10] }    // Lettuce (per 100g)
    //             ],
    //             netinf: [519, 37, 17.4, 52.3, 3.9, 6.1, 583],  // Total nutritional info for the sandwich
    //             createdAt: new Date()
    //         }
    //     ])

    // }catch(error){
    //     console.log(error);
    // }

    let perPage = 12;
    let page = req.query.page || 1;

    const locals = {
        title: "Dashboard",
        description: "Free AI Health App."
    }

    try{
        Meal.aggregate([
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.user.id)
                }
            }
        ])
        .skip(perPage * page - perPage)
        .limit(perPage)
        .then((meals)=>{
            Meal.countDocuments().then((count)=>{
                res.render('dashboard/index', {
                    userName: req.user.firstName,
                    locals,
                    meals,
                    layout: '../views/layouts/dashboard',
                    current: page,
                    pages: Math.ceil(count / perPage)
                }) 
            }).catch((err)=>{
                console.log(err);
            })
        }).catch((err)=>{
            console.log(err)
        })

    }catch(error){
        console.log(error);
    }
}


exports.dashboardViewMeal = async (req, res) => {
    try {
      // Verify the ID is a valid MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        console.log(req.params.id);  // Logs the ID to confirm
  
        // Fetch the meal by ID and user ID
        const meal = await Meal.findOne({ _id: req.params.id, user: req.user.id });
  
        // If meal is found, render the view
        if (meal) {
          res.render('dashboard/view-meals', {
            mealId: req.params.id,
            meal,
            layout: '../views/layouts/dashboard',
          });
        } else {
          res.status(404).send('Meal not found or access denied');
        }
      } else {
        res.status(400).send('Invalid Meal ID');
      }
    } catch (error) {
      console.error(error);
      res.status(500).send('Server Error');
    }
  };
  
exports.dashboardUpdateMeal = async(req, res) => {
try {
    
    await Meal.findOneAndUpdate({_id: req.params.id, user: req.user.id}, {name: req.body.title});

    res.redirect('/dashboard')

} catch (error) {
    console.log(error);
}
}



exports.dashboardDeleteMeal = async(req, res) => {
    try {

        await Meal.deleteOne({_id: req.params.id, user:req.user.id})
        res.redirect('/dashboard');

    } catch(error){
        console.log(error)
    }
}


exports.dashboardAddMeal = async (req, res) => {
    try {
        console.log("genout:", req.body.genout); // Log to check the value
        if (!req.body.genout) {
            throw new Error("genout is undefined");
        }

        const data = JSON.parse(req.body.genout);
        data["name"] = req.body.title;
        data["image"] = req.body.path;
        data["user"] = req.user.id;
        data["ninf"] = data["ninf"].map((valueArray) => ({
            value: valueArray,
            _id: new mongoose.Types.ObjectId() // Create a new ObjectId for each entry
        }));
        console.log(data);
        await Meal.create(data);
        res.redirect('/dashboard');
    } catch (error) {
        console.error("Error adding meal:", error.message);
        res.status(500).send("Internal Server Error"); // Optionally send a response to the client
    }
};


exports.dashboardUploadMeal = async(req, res) => {
    filepath = req.file.path;
    console.log(filepath);
    absolutePath = path.resolve(filepath);
    if(absolutePath){
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
        const prompt = "Analyze the given meal image and return the meal details without any assumptions or remarks about the difficulty of the estimation, I will manually add a disclaimer that this is only a rough estimation only. give output in the this exact JSON format: { name: 'Meal Name', ingredients: ['Ingredient1', 'Ingredient2' and so on...], ninf: [[Calories, Protein, Fat, Carbs, Sugars and for Ingretient1], [Calories, Protein, Fat, Carbs, Sugars for Ingredient2] and so on for all ingredients per 100 grams], netinf: [Total Calories, Total Protein, Total Fat, Total Carbohydrates] }. Use only double quotes and integers, do not add any disclaimers just stick precisely to the format";
    
        // const prompt = "I will be adding a disclaimer that this is only a rough estimation only: 1. All food items present in the image. 2. Quantity of each food item (in grams or relevant units). 3. Nutritional information for each item, including calories (kcal), protein (g), fat (g), carbohydrates (g), fiber (g), sugars (g), sodium (mg). 4. The total nutritional information for the entire dish, combining the data from all individual items.";
    
        const image = {
            inlineData: {
            data: Buffer.from(fs.readFileSync(absolutePath)).toString("base64"),
            mimeType: "image/*",
            },
        };
        
        const result = await model.generateContent([prompt, image]);
        console.log(result.response.text());

        res.render(`dashboard/add`, {
            layout: '../views/layouts/dashboard',
            genOut: JSON.parse(result.response.text()),
            filepath: filepath
        });
    }

}

exports.dashboardSearch = async(req, res) => {
    try {
        
        res.render('dashboard/search', {
            searchResult: '',
            layout: '../views/layouts/dashboard'
        })

    } catch (error) {
        
    }
}

exports.dashboardSearchSubmit = async(req,res)=>{

    try {
        let searchTerm = req.body.searchTerm;
        const searchNoSpecialCharacter = searchTerm.replace(/[^a-zA-Z0-9]/g, "");

        const searchResults = await Meal.find({
            $or: [
                {name: {$regex: new RegExp(searchNoSpecialCharacter, 'i')}},
                { ingredients: { $regex: new RegExp(searchNoSpecialCharacter, 'i')}}
            ]
        }).where({user: req.user.id});

        res.render('dashboard/search', {
            searchResults,
            layout: '../views/layouts/dashboard'
        })
    } catch (error) {
        console.log(error);
    }

}