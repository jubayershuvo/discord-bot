import mongoose from "mongoose";

let connecting = null;

/**
 * Connects to MongoDB using MONGODB_URI. Safe to call multiple times —
 * only opens one connection. This is the ONLY persistence layer the bot
 * uses; no data is ever written to local disk.
 */
export function connectDatabase() {
    if (mongoose.connection.readyState === 1) {
        return Promise.resolve(mongoose.connection);
    }

    if (connecting) {
        return connecting;
    }

    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error(
            "MONGODB_URI is not set. Add it to your .env file."
        );
    }

    mongoose.connection.on("error", (error) => {
        console.error("❌ MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
        console.warn("⚠️  MongoDB disconnected. Mongoose will retry automatically.");
    });

    connecting = mongoose
        .connect(uri, {
            serverSelectionTimeoutMS: 10000
        })
        .then((connection) => {
            console.log("✅ Connected to MongoDB");
            return connection;
        })
        .catch((error) => {
            connecting = null;
            console.error("❌ Failed to connect to MongoDB:", error.message);
            throw error;
        });

    return connecting;
}

export { mongoose };
