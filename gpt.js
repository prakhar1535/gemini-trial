// Import the Gemini Pro model
const express = require("express");
const app = express();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { json } = require("express/lib/response");
const apiKey = "AIzaSyBLEP8u2Sgf5oSNEUBWdYOwbWh_jpud0xo"; // Ensure you have set GOOGLE_API_KEY environment variable
const genAI = new GoogleGenerativeAI(apiKey);

// const configuration = new Configuration({
//   apiKey: process.env.OPENAI_API_KEY,
// });
// const openai = new OpenAIApi(configuration);
// if(openai){
//   console.log("openai is working");

// }
// interface OutputFormat {
//   [key: string]: string | string[] | OutputFormat;
// }
app.use(express.json());
app.post("/", async (req, res) => {
  const { title, units } = req.body;
  const system_prompt =
    "You are an AI capable of curating course content, coming up with relevant chapter titles, and finding relevant youtube videos for each chapter";
  const user_prompt = new Array(units.length).fill(
    `It is your job to create a course about ${title} and this unit. The user has requested to create chapters for each of the units. Then, for each chapter, provide a detailed youtube search query that can be used to find an informative educational video for each chapter. Each query should give an educational informative course in youtube.`
  )
  const output_format = {
    title: title,
    chapters:
      "an array of chapters, each chapter should have a youtube_search_query and a chapter_title key in the JSON object",
  };

  let result = await strict_output(system_prompt, user_prompt, output_format);

  // if (result && result.response && result.response.candidates && result.response.candidates.length > 0) {
  //     let respContent = result.response.candidates[0].content;
  //     if (respContent && respContent.parts && respContent.parts.length > 0) {
  //         let respText = respContent.parts[0].text;
  //         if (respText) {
  //           // Remove \n characters
  //           const cleanedData = respText.replace(/\n/g, '');
  //           // Parse the cleaned string into a JSON object
  //           const jsonData = JSON.parse(cleanedData);
  //           return res.status(200).json(jsonData);
  //         }
  //     }
  // }
  if (result) {
    return res.json({ result });
  }

  // If any part of the response is missing or invalid
  return res.status(500).send("Error: Unable to process response");
});

app.listen(3005, () => {
  console.log("Server started");
});
const model = genAI.getGenerativeModel({ model: "gemini-pro" });
async function strict_output(
  system_prompt,
  user_prompt,
  output_format,
  default_category = "",
  output_value_only = false,
  // model: string = "gpt-3.5-turbo",
  temperature = 1,
  num_tries = 3,
  verbose = false
) {
  // if the user input is in a list, we also process the output as a list of json
  const list_input = Array.isArray(user_prompt);
  // if the output format contains dynamic elements of < or >, then add to the prompt to handle dynamic elements
  const dynamic_elements = /<.*?>/.test(JSON.stringify(output_format));
  // if the output format contains list elements of [ or ], then we add to the prompt to handle lists
  const list_output = /\[.*?\]/.test(JSON.stringify(output_format));

  // start off with no error message
  let error_msg = "";

  for (let i = 0; i < num_tries; i++) {
    let output_format_prompt = `\nYou are to output ${
      list_output && "an array of objects in"
    } the following in json format: ${JSON.stringify(
      output_format
    )}. \nDo not put quotation marks or escape character \\ in the output fields.`;

    if (list_output) {
      output_format_prompt += `\nIf output field is a list, classify output into the best element of the list.`;
    }

    // if output_format contains dynamic elements, process it accordingly
    if (dynamic_elements) {
      output_format_prompt += `\nAny text enclosed by < and > indicates you must generate content to replace it. Example input: Go to <location>, Example output: Go to the garden\nAny output key containing < and > indicates you must generate the key name to replace it. Example input: {'<location>': 'description of location'}, Example output: {school: a place for education}`;
    }

    // if input is in a list format, ask it to generate json in a list
    if (list_input) {
      output_format_prompt += `\nGenerate an array of json, one json for each input element.`;
    }

    // Use OpenAI to get a response
    const result = await model.generateContent(
      JSON.stringify({
        messages: [
          {
            role: "system",
            content: system_prompt + output_format_prompt + error_msg,
          },
          { role: "user", content: user_prompt.toString() },
        ],
      })
    );

    // console.log(result,'resultttttt');

    let respContent = result.response.candidates[0].content;
    let respText = respContent.parts[0].text;
    const cleanedData = respText.replace(/\n/g, "");

    // Parse the cleaned string into a JSON object
    // const jsonData = JSON.parse(cleanedData);
    // try-catch block to ensure output format is adhered to
    try {
      let output = JSON.parse(cleanedData);

      if (list_input) {
        if (!Array.isArray(output)) {
          throw new Error("Output format not in an array of json");
        }
      } else {
        output = [output];
      }

      // check for each element in the output_list, the format is correctly adhered to
      for (let index = 0; index < output.length; index++) {
        for (const key in output_format) {
          // unable to ensure accuracy of dynamic output header, so skip it
          if (/<.*?>/.test(key)) {
            continue;
          }

          // if output field missing, raise an error
          if (!(key in output[index])) {
            throw new Error(`${key} not in json output`);
          }

          // check that one of the choices given for the list of words is an unknown
          if (Array.isArray(output_format[key])) {
            const choices = output_format[key];
            // ensure output is not a list
            if (Array.isArray(output[index][key])) {
              output[index][key] = output[index][key][0];
            }
            // output the default category (if any) if GPT is unable to identify the category
            if (!choices.includes(output[index][key]) && default_category) {
              output[index][key] = default_category;
            }
            // if the output is a description format, get only the label
            if (output[index][key].includes(":")) {
              output[index][key] = output[index][key].split(":")[0];
            }
          }
        }

        // if we just want the values for the outputs
        if (output_value_only) {
          output[index] = Object.values(output[index]);
          // just output without the list if there is only one element
          if (output[index].length === 1) {
            output[index] = output[index][0];
          }
        }
      }
      console.log(list_input, "list input");
      console.log(output, "output");
      return list_input ? output : output[0];
    } catch (e) {
      // error_msg = `\n\nResult: ${res}\n\nError message: ${e}`;
      console.log("An exception occurred:", e);
      // console.log("Current invalid json format ", res);
    }
  }

  return [];
}