/**
 * inserts data from object into the url params and attaches extra data as search params
 * @param {string} url
 * @param {object} data
 * @returns {string}
 */
export function insertDataToPath(url, data) {
	const { path, data: filteredData } = getFormattedURLResource(url, data);

	const urlSearchParams = new URLSearchParams(filteredData);
	const searchParams = urlSearchParams.toString();

	return path + (searchParams ? `?${searchParams}` : '');
}

/**
 * @typedef {Object} RequestResource
 * @property {string} path
 * @property {Object} data
 */
/**
 * returns both the formatted url with data inserted in the required segments
 * and the filtered data
 * @param {string} url
 * @param {object} data
 * @returns {RequestResource}
 */
export function getFormattedURLResource(url, data) {
	const segments = url.split('/').filter((segment) => !!segment);
	let path = '';

	segments.forEach((segment) => {
		if (!segment.includes('{')) {
			path += `/${segment}`;
			return;
		}

		// ensure that the segment has a closing }
		if (!segment.includes('}')) throw new Error(`${segment} should have a closing }`);

		// sanitize segment to get key which could be a path in the object such as post.user.id
		const keyPath = segment.replace('{', '').replace('}', '');

		// get the value of the key from the data
		const value = keyPath.split('.').reduce((acc, key) => acc[key], data);

		// delete key value pair in the data
		// this mutates the data itself therefore accessing the data outside the loop will not include the removed key value pairs
		deleteKeyPathFromObject(data, keyPath);

		path += `/${value}`;
	});

	return { path, data };
}

/**
 * deletes a property in the object which mutates the object itself
 * @param {object} obj
 * @param {string} path
 */
function deleteKeyPathFromObject(obj, path) {
	let currentObject = obj;
	const parts = path.split('.');
	const last = parts.pop();
	for (const part of parts) {
		currentObject = currentObject[part];
		if (!currentObject) return;
	}
	delete currentObject[last];
}
