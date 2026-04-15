const User = require('../models/User');

const buildDisplayName = (firstName, lastName, fallbackEmail) => {
    const joinedName = `${firstName || ''} ${lastName || ''}`.trim();
    if (joinedName) return joinedName;
    return fallbackEmail || 'Bento Member';
};

exports.syncClerkUser = async (clerkUser) => {
    const emailAddress = clerkUser.emailAddresses?.[0]?.emailAddress || '';
    const firstName = clerkUser.firstName || 'Bento';
    const lastName = clerkUser.lastName || 'User';
    const profileImage = clerkUser.imageUrl || 'https://via.placeholder.com/80';

    const payload = {
        clerkId: clerkUser.id,
        firstName,
        lastName,
        displayName: buildDisplayName(firstName, lastName, emailAddress),
        profileImage
    };

    return User.findOneAndUpdate(
        { clerkId: clerkUser.id },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};
