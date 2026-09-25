const express = require("express");
const multer = require("multer");
const { google } = require("googleapis");
const { authenticate } = require("@google-cloud/local-auth");
const createMultiAdmin = require("./multiadmin");
const path = require("path");
const fs = require("fs");

const app = express();

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = process.env.PORT || 3000;
const LOAD_TEST_MODE = process.env.LOAD_TEST_MODE === "true";
const LOAD_TEST_KEY = process.env.LOAD_TEST_KEY || "";

const ROOT_FOLDER_ID =
    "1JU3lJfEDZtn0Y5N-ZTP134wTq0X5FKLy";

const SCOPES = [
    "https://www.googleapis.com/auth/drive"
];

const CREDENTIALS_PATH =
    path.join(__dirname, "credentials.json");

const TOKEN_PATH =
    path.join(__dirname, "token.json");


/* =========================================================
   FOLDER STRUCTURE
========================================================= */

const STRUCTURE = {

    Lab: [
        "Node-JS",
        "CM",
        "JAVA",
        "DBMS",
        "SE",
        "GS"
    ],

    Theory: [
        "MSF",
        "JAVA",
        "COA",
        "DBMS",
        "SE"
    ],

    Project: [
        "Node-JS",
        "CM",
        "JAVA",
        "DBMS",
        "SE"
    ]

};


/* =========================================================
   ROLL NUMBERS
========================================================= */

const ROLLS = [

    "257R1A66C9",
    "257R1A66D0",
    "257R1A66D1",
    "257R1A66D2",
    "257R1A66D3",
    "257R1A66D4",
    "257R1A66D5",
    "257R1A66D6",
    "257R1A66D7",
    "257R1A66D8",
    "257R1A66D9",

    "257R1A66E0",
    "257R1A66E1",
    "257R1A66E2",
    "257R1A66E3",
    "257R1A66E4",
    "257R1A66E5",
    "257R1A66E6",
    "257R1A66E7",
    "257R1A66E8",
    "257R1A66E9",

    "257R1A66F0",
    "257R1A66F1",
    "257R1A66F2",
    "257R1A66F3",
    "257R1A66F4",
    "257R1A66F5",
    "257R1A66F6",
    "257R1A66F7",
    "257R1A66F8",
    "257R1A66F9",

    "257R1A66G0",
    "257R1A66G1",
    "257R1A66G2",
    "257R1A66G3",
    "257R1A66G4",
    "257R1A66G5",
    "257R1A66G6",
    "257R1A66G7",
    "257R1A66G8",
    "257R1A66G9",

    "257R1A66H0",
    "257R1A66H1",
    "257R1A66H2",
    "257R1A66H3",
    "257R1A66H4",
    "257R1A66H5",
    "257R1A66H6",
    "257R1A66H7",
    "257R1A66H8",
    "257R1A66H9",

    "257R1A66J0",
    "257R1A66J1",
    "257R1A66J3",
    "257R1A66J4",
    "257R1A66J6",
    "257R1A66J7",
    "257R1A66J8",
    "257R1A66J9",

    "257R1A66K0",
    "257R1A66K1",
    "257R1A66K2",

    "267R5A6615",
    "267R5A6616",
    "267R5A6617",
    "267R5A6618",
    "267R5A6619",
    "267R5A6620",
    "267R5A6621",
    "267R5A6622"

];


/* =========================================================
   MIDDLEWARE
========================================================= */

app.set("trust proxy", 1);

// All application pages and APIs are same-origin; do not expose them through
// wildcard CORS. These headers provide browser-side defense in depth.
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
});

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// Register tenant-aware routes before the legacy single-admin API routes.
createMultiAdmin(app, { port: PORT, loadTestMode: LOAD_TEST_MODE, legacyConfig: { rootFolderId: ROOT_FOLDER_ID, structure: STRUCTURE, rolls: ROLLS, slug: "0ByADJgBHSrnWtxN" } });


/* =========================================================
   MULTER
========================================================= */

const upload = multer({

    dest: path.join(
        __dirname,
        "uploads"
    ),

    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 1,
        fields: 4,
        parts: 5,
        fieldNameSize: 100,
        fieldSize: 4096
    },

    fileFilter: function (
        req,
        file,
        callback
    ) {

        const valid =
            /\.(ppt|pptx)$/i.test(
                file.originalname
            );

        if (!valid) {

            return callback(
                new Error(
                    "Only PPT and PPTX files are allowed."
                )
            );

        }

        callback(null, true);

    }

});


/* =========================================================
   GOOGLE OAUTH
========================================================= */

let drive;


/*
    LOCAL:

    credentials.json
    token.json

    RENDER:

    GOOGLE_OAUTH_CREDENTIALS_JSON
    GOOGLE_OAUTH_TOKEN_JSON

    IMPORTANT:
    NO SERVICE ACCOUNT IS USED.
*/

async function initializeGoogleDrive() {

    let auth;


    /* =====================================================
       RENDER / ENVIRONMENT
    ===================================================== */

    if (
        process.env.GOOGLE_OAUTH_CREDENTIALS_JSON &&
        process.env.GOOGLE_OAUTH_TOKEN_JSON
    ) {

        console.log(
            "Using Google OAuth credentials from environment."
        );

        let credentials;
        let token;

        try {

            credentials =
                JSON.parse(
                    process.env.GOOGLE_OAUTH_CREDENTIALS_JSON
                );

            token =
                JSON.parse(
                    process.env.GOOGLE_OAUTH_TOKEN_JSON
                );

        }

        catch (error) {

            console.error(
                "Invalid OAuth environment variables."
            );

            throw error;

        }


        const installed =
            credentials.installed ||
            credentials.web;


        if (!installed) {

            throw new Error(
                "Invalid OAuth credentials format."
            );

        }


        const clientId =
            installed.client_id;

        const clientSecret =
            installed.client_secret;

        const redirectUris =
            installed.redirect_uris || [];

        const redirectUri =
            redirectUris[0];


        auth =
            new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );


        auth.setCredentials(
            token
        );

    }


    /* =====================================================
       LOCAL DEVELOPMENT
    ===================================================== */

    else {

        if (
            !fs.existsSync(
                CREDENTIALS_PATH
            )
        ) {

            throw new Error(
                "credentials.json not found."
            );

        }


        if (
            fs.existsSync(
                TOKEN_PATH
            )
        ) {

            console.log(
                "Using saved Google OAuth token."
            );


            const credentials =
                JSON.parse(
                    fs.readFileSync(
                        CREDENTIALS_PATH,
                        "utf8"
                    )
                );


            const token =
                JSON.parse(
                    fs.readFileSync(
                        TOKEN_PATH,
                        "utf8"
                    )
                );


            const installed =
                credentials.installed ||
                credentials.web;


            auth =
                new google.auth.OAuth2(

                    installed.client_id,

                    installed.client_secret,

                    installed.redirect_uris[0]

                );


            auth.setCredentials(
                token
            );

        }


        else {

            console.log("");
            console.log(
                "===================================="
            );
            console.log(
                " GOOGLE ACCOUNT AUTHORIZATION"
            );
            console.log(
                "===================================="
            );
            console.log(
                "A Google authorization window will open."
            );
            console.log("");


            auth =
                await authenticate({

                    scopes: SCOPES,

                    keyfilePath:
                        CREDENTIALS_PATH

                });


            fs.writeFileSync(

                TOKEN_PATH,

                JSON.stringify(
                    auth.credentials,
                    null,
                    2
                )

            );


            console.log(
                "Google OAuth token saved."
            );

        }

    }


    /* =====================================================
       GOOGLE DRIVE CLIENT
    ===================================================== */

    drive =
        google.drive({

            version: "v3",

            auth: auth

        });


    console.log(
        "Google Drive OAuth initialized."
    );

}


/* =========================================================
   HEALTH
========================================================= */

app.get(
    "/api/health",
    async function (req, res) {

        try {

            if (!drive) {

                return res.status(503).json({

                    ok: false,

                    error:
                        "Google Drive is still initializing."

                });

            }


            const response =
                await drive.files.get({

                    fileId:
                        ROOT_FOLDER_ID,

                    fields:
                        "id,name,mimeType"

                });


            res.json({

                ok: true,

                message: "Google Drive connection is working."

            });

        }

        catch (error) {

            console.error("HEALTH ERROR:", error.message);


            res.status(500).json({

                ok: false,

                error:
                    "Google Drive health check failed."

            });

        }

    }
);


/* =========================================================
   FIND FOLDER
========================================================= */

async function findFolder(
    parentId,
    folderName
) {

    const response =
        await drive.files.list({

            q:
                `'${parentId}' in parents` +
                ` and name = '${escapeQuery(folderName)}'` +
                ` and mimeType = 'application/vnd.google-apps.folder'` +
                ` and trashed = false`,

            fields:
                "files(id,name)",

            pageSize:
                10

        });


    if (
        !response.data.files ||
        response.data.files.length === 0
    ) {

        throw new Error(
            `Folder not found: ${folderName}`
        );

    }


    return response.data.files[0];

}


/* =========================================================
   GET SUBJECT FOLDER
========================================================= */

async function getSubjectFolder(
    category,
    subject
) {

    if (
        !STRUCTURE[category]
    ) {

        throw new Error(
            "Invalid presentation type."
        );

    }


    if (
        STRUCTURE[category]
            .indexOf(subject) === -1
    ) {

        throw new Error(
            `${subject} is not available under ${category}.`
        );

    }


    const categoryFolder =
        await findFolder(

            ROOT_FOLDER_ID,

            category

        );


    const subjectFolder =
        await findFolder(

            categoryFolder.id,

            subject

        );


    return subjectFolder;

}


/* =========================================================
   DUPLICATE CHECK
========================================================= */

async function checkDuplicate(
    folderId,
    roll
) {

    const response =
        await drive.files.list({

            q:
                `'${folderId}' in parents` +
                ` and trashed = false`,

            fields:
                "files(id,name)",

            pageSize:
                1000

        });


    const files =
        response.data.files || [];


    const prefix =
        roll.toUpperCase() + "_";


    for (
        let i = 0;
        i < files.length;
        i++
    ) {

        const name =
            String(
                files[i].name || ""
            ).toUpperCase();


        if (
            name.indexOf(prefix) === 0
        ) {

            return files[i];

        }

    }


    return null;

}


/* =========================================================
   UPLOAD PPT
========================================================= */

app.post(
    "/api/upload",

    function (req, res, next) {
        if (process.env.MULTI_ADMIN_ENABLED === "false") {
            return res.status(503).json({ ok: false, error: "Unauthenticated legacy uploads are disabled." });
        }
        next();
    },

    function (req, res, next) {
        if (LOAD_TEST_MODE &&
            (!LOAD_TEST_KEY || req.get("x-load-test-key") !== LOAD_TEST_KEY)) {
            return res.status(403).json({
                ok: false,
                error: "Load test access denied."
            });
        }
        next();
    },

    upload.single("file"),

    async function (req, res) {

        let temporaryFile = null;


        try {

            if (!req.file) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "No PPT file received."

                });

            }


            temporaryFile =
                req.file.path;


            const roll =
                String(
                    req.body.roll || ""
                )
                .trim()
                .toUpperCase();


            const subject =
                String(
                    req.body.subject || ""
                )
                .trim();


            const category =
                String(
                    req.body.category || ""
                )
                .trim();


            /* VALIDATE ROLL */

            if (!roll) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Roll number is required."

                });

            }


            if (
                ROLLS.indexOf(roll) === -1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid roll number."

                });

            }


            /* VALIDATE CATEGORY */

            if (
                !category ||
                !STRUCTURE[category]
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid presentation type."

                });

            }


            /* VALIDATE SUBJECT */

            if (
                STRUCTURE[category]
                    .indexOf(subject) === -1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        `${subject} is not available under ${category}.`

                });

            }


            /* FILE NAME */

            const cleanName =
                cleanFileName(
                    req.file.originalname
                );


            const safeSubject =
                subject.replace(
                    /[^a-zA-Z0-9-]/g,
                    "_"
                );


            const finalName =
                `${roll}_${safeSubject}_${category}_${cleanName}`;


            /* LOAD TEST MODE: exercise multipart parsing and disk I/O,
               but never query or write to Google Drive. */

            if (LOAD_TEST_MODE) {

                const fileSize = req.file.size;

                safeDelete(temporaryFile);
                temporaryFile = null;

                return res.json({
                    ok: true,
                    loadTest: true,
                    message: "Load test upload accepted; Google Drive was not contacted.",
                    fileName: finalName,
                    size: fileSize
                });

            }


            /* FIND FOLDER */

            const folder =
                await getSubjectFolder(
                    category,
                    subject
                );


            /* DUPLICATE */

            const duplicate =
                await checkDuplicate(
                    folder.id,
                    roll
                );


            if (duplicate) {

                return res.status(409).json({
                    ok: false,
                    duplicate: true,
                    error: `You have already submitted a PPT for ${subject} - ${category}.`
                });

            }


            /* MIME */

            let mimeType =
                "application/vnd.openxmlformats-officedocument.presentationml.presentation";


            if (
                /\.ppt$/i.test(
                    cleanName
                )
            ) {

                mimeType =
                    "application/vnd.ms-powerpoint";

            }


            /* GOOGLE DRIVE UPLOAD */

            const response =
                await drive.files.create({

                    requestBody: {

                        name:
                            finalName,

                        parents: [
                            folder.id
                        ],

                        mimeType:
                            mimeType

                    },

                    media: {

                        mimeType:
                            mimeType,

                        body:
                            fs.createReadStream(
                                temporaryFile
                            )

                    },

                    fields:
                        "id,name,webViewLink,webContentLink"

                });


            const file =
                response.data;


            /* PUBLIC VIEW */

            try {

                await drive.permissions.create({

                    fileId:
                        file.id,

                    requestBody: {

                        type:
                            "anyone",

                        role:
                            "reader"

                    }

                });

            }

            catch (shareError) {

                console.log(
                    "Public permission could not be applied:",
                    shareError.message
                );

            }


            const presentationUrl =
                `https://docs.google.com/presentation/d/${file.id}/edit`;


            const driveUrl =
                `https://drive.google.com/file/d/${file.id}/view`;


            safeDelete(
                temporaryFile
            );


            temporaryFile = null;


            res.json({

                ok: true,

                message:
                    "PPT uploaded successfully.",

                roll:
                    roll,

                subject:
                    subject,

                category:
                    category,

                fileName:
                    file.name,

                fileId:
                    file.id,

                presentationUrl:
                    presentationUrl,

                driveUrl:
                    driveUrl

            });

        }


        catch (error) {

            console.error("UPLOAD ERROR:", error.message);


            if (
                temporaryFile
            ) {

                safeDelete(
                    temporaryFile
                );

            }


            res.status(500).json({

                ok: false,

                error:
                    "Upload failed. Please try again or contact the admin."

            });

        }

    }

);


/* =========================================================
   GET PPTs
========================================================= */

app.get(
    "/api/ppts",

    function (req, res, next) {
        if (process.env.MULTI_ADMIN_ENABLED === "false") {
            return res.status(503).json({ ok: false, error: "Unauthenticated legacy dashboard access is disabled." });
        }
        next();
    },

    async function (req, res) {

        try {

            const subject =
                String(
                    req.query.subject || ""
                ).trim();


            const category =
                String(
                    req.query.category || ""
                ).trim();


            if (
                !STRUCTURE[category]
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid presentation type."

                });

            }


            if (
                STRUCTURE[category]
                    .indexOf(subject) === -1
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Invalid subject."

                });

            }


            const folder =
                await getSubjectFolder(

                    category,

                    subject

                );


            const response =
                await drive.files.list({

                    q:
                        `'${folder.id}' in parents` +
                        ` and trashed = false`,

                    fields:
                        "files(id,name,createdTime,mimeType,webViewLink)",

                    pageSize:
                        1000,

                    orderBy:
                        "name"

                });


            const files =
                response.data.files || [];


            const submissions = [];


            for (
                let i = 0;
                i < files.length;
                i++
            ) {

                const file =
                    files[i];


                if (
                    !/\.(ppt|pptx)$/i.test(
                        file.name
                    )
                ) {

                    continue;

                }


                const roll =
                    extractRoll(
                        file.name
                    );


                if (!roll) {

                    continue;

                }


                submissions.push({

                    roll:
                        roll,

                    fileName:
                        file.name,

                    fileId:
                        file.id,

                    presentationUrl:
                        `https://docs.google.com/presentation/d/${file.id}/edit`,

                    driveUrl:
                        `https://drive.google.com/file/d/${file.id}/view`,

                    createdAt:
                        file.createdTime

                });

            }


            /* SORT BY ROLL */

            submissions.sort(

                function (a, b) {

                    return (

                        ROLLS.indexOf(a.roll) -

                        ROLLS.indexOf(b.roll)

                    );

                }

            );


            res.json({

                ok: true,

                subject:
                    subject,

                category:
                    category,

                count:
                    submissions.length,

                totalStudents:
                    ROLLS.length,

                submissions:
                    submissions

            });

        }


        catch (error) {

            console.error("GET PPT ERROR:", error.message);


            res.status(500).json({

                ok: false,

                error:
                    error.message

            });

        }

    }

);


/* =========================================================
   GET STRUCTURE
========================================================= */

app.get(
    "/api/structure",

    function (req, res) {

        res.json({

            ok: true,

            structure:
                STRUCTURE

        });

    }
);


/* =========================================================
   GET CONFIG
========================================================= */

app.get(
    "/api/config",

    function (req, res) {

        if (process.env.MULTI_ADMIN_ENABLED === "false") {
            return res.status(503).json({ ok: false, error: "Legacy configuration access is disabled." });
        }

        res.json({

            ok: true,

            structure:
                STRUCTURE

        });

    }
);


/* =========================================================
   HELPERS
========================================================= */

function extractRoll(
    name
) {

    const upper =
        String(
            name || ""
        ).toUpperCase();


    for (
        let i = 0;
        i < ROLLS.length;
        i++
    ) {

        if (
            upper.indexOf(
                ROLLS[i]
            ) === 0
        ) {

            return ROLLS[i];

        }

    }


    return "";

}


/* =========================================================
   CLEAN FILE NAME
========================================================= */

function cleanFileName(
    name
) {

    return String(
        name || ""
    )
    .trim()
    .replace(
        /[\\\/:*?"<>|]/g,
        "_"
    );

}


/* =========================================================
   ESCAPE DRIVE QUERY
========================================================= */

function escapeQuery(
    value
) {

    return String(
        value || ""
    )
    .replace(
        /\\/g,
        "\\\\"
    )
    .replace(
        /'/g,
        "\\'"
    );

}


/* =========================================================
   DELETE TEMP FILE
========================================================= */

function safeDelete(
    filePath
) {

    try {

        if (
            filePath &&
            fs.existsSync(filePath)
        ) {

            fs.unlinkSync(
                filePath
            );

        }

    }

    catch (error) {

        console.log(
            "Temporary file cleanup failed:",
            error.message
        );

    }

}


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(

    function (
        error,
        req,
        res,
        next
    ) {

        console.error("SERVER ERROR:", error.message);


        if (
            error &&
            error.code === "LIMIT_FILE_SIZE"
        ) {

            return res.status(413).json({

                ok: false,

                error:
                    "File is too large. Maximum size is 100 MB."

            });

        }


        res.status(500).json({

            ok: false,

            error:
                "Unexpected server error. Please try again later."

        });

    }

);


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

    try {

        if (LOAD_TEST_MODE) {
            if (!LOAD_TEST_KEY) {
                throw new Error("LOAD_TEST_KEY must be set when LOAD_TEST_MODE=true.");
            }
            console.warn("LOAD TEST MODE ENABLED: uploads are discarded and Google Drive is disabled.");
        } else if (process.env.MULTI_ADMIN_ENABLED === "false") {
            await initializeGoogleDrive();
        } else {
            console.log("Multi-admin mode enabled; Google Drive is connected per admin login.");
        }


        app.listen(

            PORT,

            "0.0.0.0",

            function () {

                console.log("");

                console.log(
                    "===================================="
                );

                console.log(
                    "          CSM PPT SYSTEM"
                );

                console.log(
                    "===================================="
                );

                console.log(
                    `Server: http://localhost:${PORT}`
                );

                console.log(
                    `Student: http://localhost:${PORT}/`
                );

                console.log(
                    `Dashboard: http://localhost:${PORT}/dashboard.html`
                );

                console.log(
                    `Health: http://localhost:${PORT}/api/health`
                );

                console.log(
                    `Config: http://localhost:${PORT}/api/config`
                );

                console.log(
                    "===================================="
                );

                console.log("");

            }

        );

    }


    catch (error) {

        console.error("");

        console.error(
            "GOOGLE DRIVE INITIALIZATION FAILED"
        );

        console.error(
            error.message
        );

        console.error("");

        process.exit(1);

    }

}


startServer();
