// Coordinates published in the facilities' official map links.
const locations=new Map([
 ['神栖市／神栖市文化センター',[35.888841,140.668769]],
 ['神栖市／中央図書館',[35.897569,140.636617]],
 ['神栖市／うずも図書館',[35.87375861293358,140.70506734971585]]
]);
export function flyerLocation(row){return locations.get(row.region+'／'+row.name)}
