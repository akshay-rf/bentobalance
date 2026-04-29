/**
 * Dashboard controller for BentoBalance
 * Handles meal management, AI analysis, and user dashboard functionality
 */

require('dotenv').config();

const Meal = require('../models/Meals');
const Goal = require('../models/Goal');
const BodyMetric = require('../models/BodyMetric');
const Badge = require('../models/Badge');
const Commitment = require('../models/Commitment');
const mongoose = require('mongoose');
const path = require('path')
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs=require("fs");
const { checkAndAwardBadges } = require('./achievementsController');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.API_KEY);
const GEMINI_MODELS = [
    process.env.GEMINI_MODEL || 'gemini-2.5-flash'
].filter(Boolean);

/**
 * Parses and normalizes JSON response from Gemini AI
 * @param {string} rawText - Raw text response from Gemini
 * @returns {Object} Parsed JSON object
 */
const parseGeminiJson = (rawText) => {
    const trimmed = rawText.trim();
    try {
        return JSON.parse(trimmed);
    } catch (directError) {
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced && fenced[1]) {
            return JSON.parse(fenced[1].trim());
        }

        const jsonObject = trimmed.match(/\{[\s\S]*\}/);
        if (jsonObject && jsonObject[0]) {
            return JSON.parse(jsonObject[0]);
        }

        throw directError;
    }
};

/**
 * Normalizes meal data structure from Gemini response
 * @param {Object} payload - Raw meal data from AI
 * @returns {Object} Normalized meal object
 */
const normalizeGeminiMealOutput = (payload) => {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Gemini response is not an object.');
    }

    const normalized = {
        name: String(payload.name || 'Untitled Meal'),
        ingredients: Array.isArray(payload.ingredients) ? payload.ingredients.map((item) => String(item)) : [],
        ninf: Array.isArray(payload.ninf) ? payload.ninf : [],
        netinf: Array.isArray(payload.netinf) ? payload.netinf : []
    };

    if (!normalized.ingredients.length) {
        throw new Error('No ingredients detected from image.');
    }

    normalized.ninf = normalized.ninf.map((row) =>
        Array.isArray(row) ? row.map((value) => Number(value) || 0).slice(0, 5) : [0, 0, 0, 0, 0]
    );

    while (normalized.ninf.length < normalized.ingredients.length) {
        normalized.ninf.push([0, 0, 0, 0, 0]);
    }

    normalized.netinf = normalized.netinf.map((value) => Number(value) || 0).slice(0, 4);
    while (normalized.netinf.length < 4) {
        normalized.netinf.push(0);
    }

    return normalized;
};


const getNutritionTotals = async (userId) => {
    const totals = await Meal.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $group: {
                _id: null,
                totalCalories: { $sum: { $arrayElemAt: ["$netinf", 0] } },
                totalProtein: { $sum: { $arrayElemAt: ["$netinf", 1] } },
                totalFat: { $sum: { $arrayElemAt: ["$netinf", 2] } },
                totalCarbs: { $sum: { $arrayElemAt: ["$netinf", 3] } }
            }
        }
    ]);

    return totals[0] || { totalCalories: 0, totalProtein: 0, totalFat: 0, totalCarbs: 0 };
};

exports.dashboard = async (req, res) => {
    const locals = {
        title: "Dashboard Home",
        description: "Free AI Health App."
    };

    try {
        await checkAndAwardBadges(req.user.id);
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);

        const [totalStats, activeGoals, completedGoals, badges, commitments, latestMetric, totalMeals, mealsThisWeek, metricsLogged, activeCommitments] = await Promise.all([
            getNutritionTotals(req.user.id),
            Goal.countDocuments({ user: req.user.id, status: 'active' }),
            Goal.countDocuments({ user: req.user.id, status: 'completed' }),
            Badge.countDocuments({ user: req.user.id }),
            Commitment.find({ user: req.user.id }).sort({ streak: -1 }).limit(1),
            BodyMetric.findOne({ user: req.user.id }).sort({ date: -1 }),
            Meal.countDocuments({ user: req.user.id }),
            Meal.countDocuments({ user: req.user.id, createdAt: { $gte: sevenDaysAgo } }),
            BodyMetric.countDocuments({ user: req.user.id }),
            Commitment.countDocuments({ user: req.user.id, status: 'active' })
        ]);

        const avgCaloriesPerMeal = totalMeals > 0 ? Math.round(totalStats.totalCalories / totalMeals) : 0;

        res.render('dashboard/index', {
            userName: req.user.firstName,
            locals,
            layout: '../views/layouts/dashboard',
            totalCalories: Math.round(totalStats.totalCalories),
            totalProtein: Math.round(totalStats.totalProtein),
            totalFat: Math.round(totalStats.totalFat),
            totalCarbs: Math.round(totalStats.totalCarbs),
            activeGoals,
            completedGoals,
            badgesUnlocked: badges,
            longestStreak: commitments[0]?.streak || 0,
            latestWeight: latestMetric?.weight || null,
            totalMeals,
            mealsThisWeek,
            avgCaloriesPerMeal,
            activeCommitments,
            metricsLogged
        });
    } catch (error) {
        console.log(error);
        res.status(500).send('Server Error');
    }
};

exports.dashboardMeals = async (req, res) => {
    const perPage = 12;
    const page = Number(req.query.page) || 1;

    const locals = {
        title: "Meals",
        description: "Track and manage your meals."
    };

    try {
        const meals = await Meal.aggregate([
            { $sort: { createdAt: -1 } },
            { $match: { user: new mongoose.Types.ObjectId(req.user.id) } }
        ])
            .skip(perPage * page - perPage)
            .limit(perPage);

        const count = await Meal.countDocuments({ user: new mongoose.Types.ObjectId(req.user.id) });

        res.render('dashboard/meals', {
            userName: req.user.firstName,
            locals,
            meals,
            layout: '../views/layouts/dashboard',
            current: page,
            pages: Math.ceil(count / perPage)
        });
    } catch (error) {
        console.log(error);
        res.status(500).send('Server Error');
    }
};


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

    res.redirect('/dashboard/meals')

} catch (error) {
    console.log(error);
}
}



exports.dashboardDeleteMeal = async(req, res) => {
    try {

        await Meal.deleteOne({_id: req.params.id, user:req.user.id})
        res.redirect('/dashboard/meals');

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
        res.redirect('/dashboard/meals');
    } catch (error) {
        console.error("Error adding meal:", error.message);
        res.status(500).send("Internal Server Error"); // Optionally send a response to the client
    }
};


exports.dashboardUploadMeal = async(req, res) => {
    if (!req.file) {
        return res.status(400).render('dashboard/add', {
            layout: '../views/layouts/dashboard',
            genOut: null,
            filepath: '',
            errorMessage: 'No image was uploaded. Please choose an image and try again.'
        });
    }

    const filepath = req.file.path;
    console.log(filepath);
    const absolutePath = path.resolve(filepath);
    if(absolutePath){
    
        const prompt = "Analyze the given meal image and return the meal details without any assumptions or remarks about the difficulty of the estimation, I will manually add a disclaimer that this is only a rough estimation only. give output in the this exact JSON format: { name: 'Meal Name', ingredients: ['Ingredient1', 'Ingredient2' and so on...], ninf: [[Calories, Protein, Fat, Carbs, Sugars and for Ingretient1], [Calories, Protein, Fat, Carbs, Sugars for Ingredient2] and so on for all ingredients per 100 grams], netinf: [Total Calories, Total Protein, Total Fat, Total Carbohydrates] }. Use only double quotes and integers, do not add any disclaimers just stick precisely to the format";
    
        // const prompt = "I will be adding a disclaimer that this is only a rough estimation only: 1. All food items present in the image. 2. Quantity of each food item (in grams or relevant units). 3. Nutritional information for each item, including calories (kcal), protein (g), fat (g), carbohydrates (g), fiber (g), sugars (g), sodium (mg). 4. The total nutritional information for the entire dish, combining the data from all individual items.";
    
        const image = {
            inlineData: {
            data: Buffer.from(fs.readFileSync(absolutePath)).toString("base64"),
            mimeType: req.file.mimetype || "image/jpeg",
            },
        };

        let lastError = null;
        for (const modelName of GEMINI_MODELS) {
            try {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                });
                const result = await model.generateContent([prompt, image]);
                const textResponse = result.response.text();
                const parsedResponse = normalizeGeminiMealOutput(parseGeminiJson(textResponse));

                return res.render('dashboard/add', {
                    layout: '../views/layouts/dashboard',
                    genOut: parsedResponse,
                    filepath
                });
            } catch (error) {
                lastError = error;
            }
        }

        console.log("Gemini processing failed:", lastError);
        return res.status(502).render('dashboard/add', {
            layout: '../views/layouts/dashboard',
            genOut: null,
            filepath,
            errorMessage: `AI analysis is temporarily unavailable. ${lastError?.message || 'Please try another image in a moment.'}`
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