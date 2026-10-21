import app from "./src/index.js";

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`Team Task Manager API listening on port ${port}`);
  if (process.env.NODE_ENV !== "production") {
    console.warn("Using in-memory sessions for development; sessions will not survive a restart.");
  }
});
