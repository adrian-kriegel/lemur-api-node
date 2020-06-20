
require('dotenv').config()

if(!process.env.POSTMAN_API_KEY)
{
	console.error('Missing postman API key in .env file.')
	console.error('.env file must be placed in module root.')
}

const lemur = require('../')

const baker = require('../lib/schema-baker')

const express = require('express')

const SERVER_PORT = 1337

/**
	Create a new options preset to re-use across different files and routers

	Do this once in your project before creating any routers.
*/
lemur.options('internal-api',
{
	//provide lemur with your express version
	express: express,

	//provide lemur with host info for documentation purposes
	host: 'localhost',
	port: SERVER_PORT, 
	protocol: 'http',

	mountpath: '/',

	//default request methods if none is supplied in an endpoint definition
	method: ['POST'],

	//link up your postman collection
	postman: 
	{
		apikey: process.env.POSTMAN_API_KEY,
		collection_uid: process.env.POSTMAN_COLLECTION_UID
	},

	//a list of schemas if you want to use $ref
	schemas: 
	{
		date:
		{
			//a json schema for a date which can be referenced using $ref
			id: '/date',
			type: 'string',

			//this is redundant and merely for the purpose of the example
			//since we use the process function to cast to Date anyway
			pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
		}
	}
})

//create a new router using our defined options
//if you only use one router, you can also put the options in there directly
const router = new lemur.LemurRouter({ use: 'internal-api' })

//use the add function to add a new endpoint
router.add(
{
	//this endpoint will answer POST and GET requests
	method: ['POST', 'GET'],

	//express route string
	route: '/echo-date',

	//for documentation
	description: 'Returns a date as a stringified date object.',

	//outline the expected query parameters
	query: 
	{
		date: 
		{ 
			//use $ref if you want to use a schema from the "schemas" option
			$ref: '/date',

			//the example will be the default value on postman
			example: '09/17/1997',

			//we use the process function to turn the string into a Date object
			//if this throws an exception, the string is rejected
			//this is not standard for json schemas
			//the process function is not required
			//you can use a single function or an array of functions
			process: [(str) => 
			{
				let timestamp = Date.parse(str)

				if(!isNaN(timestamp))
				{
					return new Date(timestamp)

				}else
				{
					throw lemur.ERRORS.BAD_REQUEST()
					.msg('invalid date')
				}
			},
			(date) =>
			{
				//you can now use the date object returned from the first function to process the parameter further
				if(date < new Date('09/17/1997'))
				{
					throw lemur.ERRORS.BAD_REQUEST()
					.msg('please provide a date after 09/17/1997')
				}

				return date
			}],

			//by default this is false. the request will fail if no date is provided
			required: true
		}
	},

	//express callback or array for a callback chain
	//return something to trigger res.send()
	//throw an APIError to send it to the client
	//any other exception will result in an internal server error being sent to the client
	callback: (req) =>
	{
		//just echo the parsed date
		return req.query.date
	}
})

router.add(
{
	method: ['POST', 'GET'],

	route: '/typeof',

	description: 'Returns type of JSON object.',

	query:
	{
		someObject:
		{
			schema:
			{
				type: 'object',
				properties:
				{
					requiredProp:
					{
						type: 'boolean'
					}
				},
				//we are going to add this property in the before() function
				required: ['requiredProp'],
			},

			//you can use the before function to process the parameter before it is matched agains the schema
			//it works just like the process function
			//this can also be an array
			//in this example we add a property to make the schema match
			before: obj => { return { ...obj, 'requiredProp': true } } 
		}
	},
	
	callback: (req) => { return typeof(req.query.someObject) }
})


/**
	Error handling example
*/
//this route will always produce an error
router.add(
{
	method: 'ALL',

	route: '/internal-error',

	callback: () =>
	{
		//produce an error that is not an APIError
		return thisVarIsNotDefined.attr
	}
})

//anything thrown in the callback that is not an APIError will cause this handler to be executed
lemur.onInternalError((req, res, error) =>
{
	console.error(error)
})


console.log(JSON.stringify(lemur.bakeParams('POST', '/echo-date')))

//create an express app like normal
const app = express()

//add your favourite body parser
app.use(express.urlencoded({extended: false}))

app.use(router.getRouter())

app.listen(SERVER_PORT, () => console.log('Server running on port ' + SERVER_PORT) )