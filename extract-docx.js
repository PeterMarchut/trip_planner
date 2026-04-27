const mammoth = require('mammoth');
const fs = require('fs');

mammoth.extractRawText({path: 'private/family Greece trip.docx'})
    .then(function(result){
        console.log(result.value);
        fs.writeFileSync('private/extracted_text.txt', result.value);
    })
    .catch(function(error) {
        console.error(error);
    });