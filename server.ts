import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
// when using middleware `hostname` and `port` must be provided below
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
            origin: "*", // Adjust in production to the mobile app's origin if needed
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log("A user connected:", socket.id);

        // Patients and Doctors can join a room based on their unique pair ID
        // Example: "chat_patient_1_doctor_2"
        socket.on("join_chat", ({ patientId, doctorId }) => {
            const room = `chat_patient_${patientId}_doctor_${doctorId}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined room ${room}`);
        });

        socket.on("send_message", (data) => {
            const { patient_id, doctor_id, sender, content, created_at } = data;
            const room = `chat_patient_${patient_id}_doctor_${doctor_id}`;
            // Broadcast to everyone in the room except the sender
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
