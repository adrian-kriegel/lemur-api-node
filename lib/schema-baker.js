
const baker = module.exports

/**
	Finds definition in definitions object/array
*/
baker.findDefinition = function(id, definitions)
{
	//if definitions is of type object, try using id as a key because it may be faster than linear search
	if(!Array.isArray(definitions))
	{
		//guess that the key is the id without slashes
		if(definitions[id] && definitions[id].id === id)
			return definitions[id]
	}

	//second attempt: linear search
	for(let i in definitions)
		if(definitions[i].id === id)
			return definitions[i]
}

/**
	Bakes definitions into schema for better digestion. Enables serving single schemas with only required definitions
*/
baker.bake = function(schema, definitions)
{
	//start with an empty schema
	let result = Array.isArray(schema) ? [] : {  }

	for(var key in schema)
	{
		//ignore id keys 
		if(key === 'id')
			continue

		if(
			Array.isArray(schema[key])
			|| typeof(schema[key]) === 'object'
			&& !(schema[key] instanceof RegExp)
		)
		{
			//go one level deeper
			result[key] = baker.bake(schema[key], definitions)

		}else
		{
			if(key === '$ref')
			{
				//bake in the definition
				return baker.bake( baker.findDefinition(schema.$ref, definitions), definitions )

			}else
			{
				result[key] = schema[key]
			}
		}
	}

	return result
}

/**
	Bakes set of parameters
*/
baker.bakeParams = function(params, definitions)
{
	let res = {}

	for(let name in params) 
	{
		res[name] =
		{ 
			//keep the description and examples
			...params[name],
			//only replace the schema
			schema: baker.bake(params[name].schema, definitions)
		}
	}

	return res
}