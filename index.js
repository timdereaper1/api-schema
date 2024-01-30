const readline = require('readline');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

const schemaFile = args.indexOf('--schema');
const outputFile = args.indexOf('--out');

if (schemaFile === -1) throw new Error('--schema file is required');
if (outputFile === -1) throw new Error('--out file path is required');

const apiSchemaFilePath = path.join(process.cwd(), args[schemaFile + 1]);

const fileReadString = fs.createReadStream(apiSchemaFilePath);
const fileReader = readline.createInterface(fileReadString);

let template =
	"import { useQuery, useMutation, UndefinedInitialDataOptions, UseMutationOptions } from '@tanstack/react-query';\nimport { insertDataToPath, getFormattedURLResource } from './util'\n";
let readingConfig = false;
let baseURL = undefined;

fileReader.on('line', (line) => {
	if (!line) return;

	if (line.startsWith('//')) return;

	const texts = line
		.trim()
		.split(' ')
		.filter((text) => !!text);

	const firstWord = texts[0];

	const keywords = ['type', 'get', 'config', 'input', 'post', 'put', 'patch', 'delete'];

	if (keywords.includes(firstWord)) {
		if (firstWord === 'config') readingConfig = true;
		else template += getFormattedKeywordInterface(texts); // beginning of type
	} else if (firstWord === '}') {
		if (readingConfig) readingConfig = false;
		else template += '};\n'; // ending of type
	} else {
		if (readingConfig) setConfiguration(texts);
		else template += getFormattedKeyValuePairInterface(texts); // body of type
	}
});

/**
 * @param {string[]} texts
 */
function setConfiguration([key, _operator, value]) {
	if (key === 'baseURL') baseURL = sanitizeText(value);
}

/**
 * @param {string[]} texts
 */
function getFormattedKeyValuePairInterface([key, valueType]) {
	const primitiveTypeMapping = { '@integer': 'number', '@string': 'string' };
	let typescriptTemplate = `${key}: ${primitiveTypeMapping[valueType] ?? valueType}${
		valueType === '{' ? '' : ';'
	}`;
	return typescriptTemplate;
}

/**
 * @param {string[]} texts
 */
function getFormattedKeywordInterface(texts) {
	const [keyword, name, ...rest] = texts;
	let typescriptTemplate = '';

	if (['type', 'input'].includes(keyword)) typescriptTemplate = `type ${name} = `;

	if (keyword === 'get') typescriptTemplate = getFormattedGetRequestMethodQueryTemplate(texts);

	if (['post', 'put', 'patch', 'delete'].includes(keyword))
		typescriptTemplate = getFormattedPostRequestMethodQueryTemplate(texts);

	if (rest.length === 1 && rest[0] === '{') typescriptTemplate += '{';

	return typescriptTemplate;
}

/**
 * @param {string[]} texts
 */
function getFormattedPostRequestMethodQueryTemplate(texts) {
	const [keyword, nameAndRoute, input, responseSchema] = texts;
	const [name, route] = nameAndRoute.split('(');
	const sanitizedRoute = sanitizeText(route);
	const sanitizedInput = sanitizeText(input);
	const response = getValueType(responseSchema);

	const url = `${baseURL ?? ''}${sanitizedRoute}`;

	return `export function use${name}(args?: Omit<UseMutationOptions<${response}, Error, ${sanitizedInput}, unknown>, 'mutationFn'>) {
		return useMutation({
			...(args ?? {}),
			mutationFn: async (variables: ${sanitizedInput}) => {
				const { path, data } = getFormattedURLResource("${url}", variables);
				const response = await fetch(path, {
					method: "${keyword.toUpperCase()}",
					body: JSON.stringify(data),
					headers: {
						'Content-type': 'application/json; charset=UTF-8',
					},
				});
				if (!response.ok) throw new Error('Sorry cannot make request');
				return response.json() as Promise<${response}>;
			}
		});
	}\n`;
}

/**
 * @param {string[]} texts
 */
function getFormattedGetRequestMethodQueryTemplate(texts) {
	const [_, name, ...rest] = texts;
	const [requestName, otherRequestParams] = name.split('(');
	const [route] = otherRequestParams.split(')');

	const url = `${baseURL ?? ''}${sanitizeText(route)}`;

	const [
		inputOrResponse,
		response, // string | undefined
	] = rest;

	// check if there is an input
	const inputType = inputOrResponse && response ? sanitizeText(inputOrResponse) : undefined;

	const responseType = getValueType(response ?? inputOrResponse);

	const reactQueryTemplate = `
	export const ${requestName}QueryKey = "${url}";
	export function use${requestName}<T = ${responseType}>(args${
		inputType ? '' : '?'
	}: Omit<UndefinedInitialDataOptions<${responseType}, Error, T, [string${
		inputType ? ', ' + inputType : ''
	}]>${inputType ? `& { variables: ${inputType}}` : ''}, 'queryKey' | 'queryFn'>) {
		return useQuery({
			...(args ?? {}),
			queryKey: [${requestName}QueryKey${inputType ? ', args.variables' : ''}],
			queryFn: async () => {
				const url = insertDataToPath(${requestName}QueryKey, ${inputType ? 'args.variables' : '{}'});
				const response = await fetch(url);
				if (!response.ok) throw new Error('Sorry cannot make request');
				return response.json() as Promise<${responseType}>;
			}
		});
	}\n`;

	return reactQueryTemplate;
}

/**
 * @param {string} value
 * @returns {string}
 */
function getValueType(value) {
	const primitiveTypeMapping = { '@integer': 'number', '@string': 'string', '@bool': 'boolean' };
	const sanitizedValue = sanitizeText(value);
	const type = primitiveTypeMapping[sanitizedValue] ?? sanitizedValue;
	if (value.includes('[')) return type + '[]'; // [User] -> User[]
	return type; // @bool -> boolean
}

/**
 * @param {string} text
 */
function sanitizeText(text) {
	return text
		.replace('"', '')
		.replace('"', '')
		.replace(',', '')
		.replace(')', '')
		.replace(':', '')
		.replace('[', '')
		.replace(']', '');
}

fileReader.on('close', () => {
	console.log(template);
	const generatedCodeFilePath = path.join(process.cwd(), args[outputFile + 1]);
	const fileExists = fs.existsSync(generatedCodeFilePath);
	if (fileExists) fs.writeFileSync(generatedCodeFilePath, template);
	else fs.appendFileSync(generatedCodeFilePath, template);
});
