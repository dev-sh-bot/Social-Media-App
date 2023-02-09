const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const {
    createUser,
    checkEmailAndNumber,
    encryptPssword,
    verifyPassword,
    checkAvailable,
} = require("../utils/helper");

const User = require("../models/user");

// GET User 
const getUser = async (req, res) => {
    const user = req.user;
    try {
        let userdata = { ...user._doc }

        delete userdata.password;
        return res.json({ status: true, message: "Operation successfull", data: userdata })
    } catch (error) {
        return res.status(400).json({ status: false, message: "An error occured!", trace: error.message })
    }
}

// Creating User
const registerUser = async (req, res) => {
    let { userName, email, phoneNumber, password, profile } = req.body;
    try {
        const isAvailable = await checkEmailAndNumber(email, phoneNumber); // return user

        if (isAvailable) {
            return res.json({ message: "Please use different Email/Number" });
        }

        password = await encryptPssword(password);

        const result = await createUser({ userName, email, phoneNumber, password, profile });
        return res.status(201).json({ status: true, message: "User is successfully created", trace: result });
    } catch (error) {
        return res.status(422).json({ status: false, message: "An error occured!", trace: error.message });
    }
}

// Login
const login = async (req, res) => {
    const { email, phoneNumber, password } = req.body;
    try {
        let user = await checkEmailAndNumber(email, phoneNumber);

        if (!user) {
            return res.json({ message: "Please use correct Email/Number" });
        }

        const result = await verifyPassword(password, user.password);

        if (!result) {
            return res.json({ message: "Please use correct password" });
        }

        // Creating token
        const token = jwt.sign({ id: user._id }, process.env.JWT);

        let userdata = {
            ...user._doc,
            token
        }

        delete userdata.password;
        return res.status(200).json({ status: true, message: "Login successfull", data: userdata });
    } catch (error) {
        return res.status(400).json({ status: false, message: "An error occured!", trace: error.message });
    }
}

// Update
const updateUser = async (req, res) => {
    const body = req.body
    const user = req.user;

    try {

        if (body.password) {
            body.password = await encryptPssword(body.password);
        }

        const updatedUser = await User.findByIdAndUpdate({ _id: user._id }, { $set: body }, { new: true });

        return res.status(200).json({
            status: true,
            message: 'User Updated!',
            data: updatedUser
        });

    } catch (error) {
        res.json({
            status: false,
            message: "Unexpected Error Occured!",
            trace: error.message
        })
    }
}

// Update Profile Picture
const updateProfilePicture = async (req, res) => {
    try {
        let profilePicture = req.files?.profilePicture;

        if (!profilePicture) {
            return res.status(400).json({
                status: false,
                message: "Please add profile picture!"
            });
        }

        let fileName = `public/profiles/${Date.now()}-${profilePicture.name.replace(/ /g, '-').toLowerCase()}`;
        await profilePicture.mv(fileName);

        profilePicture = fileName.replace("public", "");
        const updateUser = await User.findByIdAndUpdate(req.user._id, { $set: { profilePicture } }, { new: true });

        return res.status(200).json({
            status: true,
            message: "Profile Picture Updated!",
            data, updateUser
        });
    } catch (error) {
        return res.status(422).json({
            status: false,
            message: "Unexpected Error Occured!",
            trace: error.message
        });
    }
}

// Send Request
const sendRequest = async (req, res) => {
    try {
        const body = req.body;
        const user = req.user;

        const newUser = await User.findByIdAndUpdate({ _id: body.id }, {
            $push: {
                pendingRequest: { _id: user._id }
            }
        }, { new: true });
        console.log(newUser.pendingRequest)
        return res.status(200).json({
            status: true,
            message: "Operation successfull",
        });

    } catch (error) {
        return res.status(422).json({
            status: false,
            message: "Unexpected Error Occured! while sending request",
            trace: error.message
        });
    }
}

// Responce request 
const responceRequest = async (req, res) => {
    const { id, status } = req.body;  // request sender
    const user = req.user;

    try {
        if (status === 1) { //Accepting Request

            //  check user available in the list or not
            const result = checkAvailable(id, user.pendingRequest);
            if (!result) {
                return res.status(404).json({
                    status: false,
                    message: "User is not Available!"
                });
            }

            // adding user in the request sender friend list
            await User.updateOne(
                { _id: id },
                { $push: { friends: { _id: user._id } } }
            );

            // deleting friend from the friend list of user and add into the friend list of user
            await User.updateOne(
                { _id: user._id },
                {
                    $push: { friends: { _id: new ObjectId(id) } },
                    $pull: { pendingRequest: { _id: new ObjectId(id) } }
                }
            );

            return res.status(200).json({
                status: true,
                message: "Operation is successfull, request is Accepted",
            });

        } else {
            //  check user available in the list or not
            const result = checkAvailable(id, user.pendingRequest);
            if (!result) {
                return res.status(404).json({
                    status: false,
                    message: "User is not Available!"
                });
            }
            // delete object from array
            await User.updateOne(
                { _id: user._id },
                { $pull: { pendingRequest: { _id: new ObjectId(id) } } }
            );

            res.json({ status: true, message: "Operation is successfull, request is decline" });
        }

    } catch (error) {
        return res.status(422).json({
            status: false,
            message: "Unexpected Error Occured!",
            trace: error.message
        });
    }


}

// Block User
const blockUser = async (req, res) => {
    const user = req.user;
    const { id } = req.body;

    try {
        await User.updateOne(
            { _id: user._id },
            {
                $pull: { pendingRequest: { _id: new ObjectId(id) } },
            }
        );
        await User.updateOne(
            { _id: user._id },
            {
                $pull: { friends: { _id: new ObjectId(id) } },
                $push: { blockUser: { _id: new ObjectId(id) } }
            }
        );
        return res.json({ status: true, message: "Operation is successfull, user is blocked" });
    } catch (error) {
        return res.status(422).json({
            status: false,
            message: "Unexpected Error Occured! while blocking user",
            trace: error.message
        });
    }
}

// See Friend List
const friendsList = async (req, res) => {
    const { friends } = req.user;
    if (friends.length) {
        try {
            const ids = friends.map(friend => ObjectId(friend._id));
            const data = await User.find({ _id: { $in: ids } }, { userName: 1, profile: 1 });

            return res.status(422).json({
                status: false,
                message: "Operation successfull",
                trace: data
            });

        } catch (error) {
            return res.status(422).json({
                status: false,
                message: "Unexpected Error Occured! while fetching friend list",
                trace: error.message
            });
        }
    } else {
        return res.status(404).json({
            status: false,
            message: "User is not Available!"
        });
    }
}

// See Block List
const blockList = async (req, res) => {
    const { blockUser } = req.user;
    if (blockUser.length) {
        try {
            const ids = blockUser.map(user => ObjectId(user._id));
            const data = await User.find({ _id: { $in: ids } }, { userName: 1, profile: 1 });

            return res.status(422).json({
                status: false,
                message: "Operation successfull",
                trace: data
            });

        } catch (error) {
            return res.status(422).json({
                status: false,
                message: "Unexpected Error Occured! while fetching block list",
                trace: error.message
            });
        }
    } else {
        return res.status(404).json({
            status: false,
            message: "User is not Available!"
        });
    }
}

const unfriend = async (req, res) => {
    const { id } = req.body; // End Person
    const user = req.user;

    //  check user available in the list or not
    const result = checkAvailable(id, user.friends);
    if (!result) {
        return res.status(404).json({
            status: false,
            message: "User is not Available!"
        });
    }

    try {
        // removing end person from user friends list
        await User.updateOne(
            { _id: user._id },
            {
                $pull: { friends: { _id: new ObjectId(id) } },
            }
        );

        // removing user from end person friends list
        await User.findByIdAndUpdate(
            { _id: id },
            {
                $pull: { friends: { _id: user._id } },
            }
        );

        return res.status(200).json({
            status: true,
            message: "Operation successfull user is unfriended",
        });
    } catch (error) {
        return res.status(422).json({
            status: false,
            message: "Unexpected Error Occured!",
            trace: error.message
        });
    }
}

const unblock = async (req, res) => {
    const { id } = req.body; // end person
    const user = req.user;

    console.log(user)

    //  check user available in the list or not
    const result = checkAvailable(id, user.blockUser);

    if (!result) {
        return res.status(404).json({
            status: false,
            message: "User is not Available!"
        });
    }

    try {
        // removing end person from user block list
        await User.updateOne(
            { _id: user._id },
            {
                $pull: { blockUser: { _id: new ObjectId(id) } },
            }
        );

        return res.status(200).json({
            status: true,
            message: "Operation successfull user is unblocked"
        });
    } catch (error) {
        return res.status(422).json({
            status: false,
            message: "Unexpected Error Occured!",
            trace: error.message
        });
    }
}



// See All Pending request  using db.getCollection('feed').find({"_id" : {"$in" : [ObjectId("55880c251df42d0466919268"), ObjectId("55bf528e69b70ae79be35006")]}});
// https://stackoverflow.com/questions/32264225/how-to-get-multiple-document-using-array-of-mongodb-id


module.exports = {
    getUser,
    registerUser,
    login,
    updateUser,
    updateProfilePicture,
    sendRequest,
    responceRequest,
    blockUser,
    friendsList,
    blockList,
    unfriend,
    unblock
}