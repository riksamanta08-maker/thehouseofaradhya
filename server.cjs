const app = require('./backend/index');
const { env } = require('./backend/src/config');
const { warmUp } = require('./backend/src/db/prismaClient');

const port = Number(process.env.PORT || env.port || 5001);

app.listen(port, () => {
  console.log(`Aradhya server ready on port ${port}`);
  warmUp();
});
