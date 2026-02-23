const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server: SocketIOServer } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    try {
      if (!req.url) return;
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
  global.__DOCTOR_IO__ = io;

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join_chat", ({ patientId, doctorId }) => {
      const room = `chat_patient_${patientId}_doctor_${doctorId}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined room ${room}`);
    });

    socket.on("send_message", (data) => {
      const { patient_id, doctor_id } = data || {};
      const room = `chat_patient_${patient_id}_doctor_${doctor_id}`;
      socket.to(room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Socket.IO server running on WS port ${port}`);
    });
});
