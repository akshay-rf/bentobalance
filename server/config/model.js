require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs=require("fs");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const funcall = async(path)=>{
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = "Analyze this image of food and provide without any any assumptions or remarks about the difficulty of the estimation, I will manually add a disclaimer that this is only a rough estimation only. Strictly follow this format: ['name_of_food', [food_items_present], [nutritional_information_per_100g_for_each_item], [total_nutritional_information_for_the_dish]] where nutritional_information_per_100g_for_each_item has integer arrays of order [calories, protein, fat, carbohydrates, fiber, sugars, sodium] and total_nutritional_information_for_the_dish has integer array of order total calories, total protein, total fat, total carbohydrates, total fiber, total sugars, total sodium";

    // const prompt = "I will be adding a disclaimer that this is only a rough estimation only: 1. All food items present in the image. 2. Quantity of each food item (in grams or relevant units). 3. Nutritional information for each item, including calories (kcal), protein (g), fat (g), carbohydrates (g), fiber (g), sugars (g), sodium (mg). 4. The total nutritional information for the entire dish, combining the data from all individual items.";

    const image = {
        inlineData: {
        data: Buffer.from(fs.readFileSync(path)).toString("base64"),
        mimeType: "image/*",
        },
    };
    
    const result = await model.generateContent([prompt, image]);
    console.log(result.response.text());
};

module.exports = funcall()