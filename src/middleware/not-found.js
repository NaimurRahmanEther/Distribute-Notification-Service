const AppError = require("../shared/errors/AppError");


function notfound(req,res,next){
    next(new AppError(
         `Route not found: ${req.method} ${req.originalUrl}`,
      404
    ))
}

module.exports = notfound;
