'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.safeDelete = functions.database.ref('posts').onDelete((snap, context) => {
    const deletedData = snap.val(); // data that was deleted
    admin.database().ref('/recents/').child(snap.key).remove();    
});

exports.publishStory = functions.database.ref('posts/{postId}')
    .onCreate((snap, context) => {

    const story = snap.val(); // data that was created
    const storyId = snap.key;

    console.log("save post", storyId, "for user", story.user);

    //  add to recents
    admin.database().ref('/recents/').child(storyId).set(story.user);

    // personalized collection per user
    admin.database().ref('/user_feed/' + story.user).child(storyId).set(story.user);

    // filtered collection of uploaded stories per user
    admin.database().ref('/uploads/' + story.user).child(storyId).set(story.user);

    // add story to followers feed
    var followers = admin.database().ref('/users/' + story.user + '/followers/')
        .once('value').then(function(snapshot) {

        snapshot.forEach(function(childSnapshot) {
            var childKey = childSnapshot.key;
            var childData = childSnapshot.val();
            admin.database().ref('/user_feed/' + childKey).child(storyId).set(story.user);

            // send push notification to user channel
            var payload = {
                notification: {
                    title: story.user + "posted a story",
                    body: story.message,
                },
                topic: '/topics/feed' + childKey
            };

            admin.messaging().send(payload)
        });
    });

    var user = admin.database().ref('/users/' + story.user).once('value').then(function(snapshot) {
        var userID = snapshot.key;
        var user = snapshot.val();

        // send push notification from admin
        if (user.main == true) {
            var payload = {
                notification: {
                    title: "New story posted",
                    body: message
                },
                topic: '/topics/feed'
            };
        
            return admin.messaging().send(payload);
        }
    });

    return Promise.all([followers, user]);
});

exports.onComments = functions.database.ref('/comments/{postId}')
    .onCreate((snap, context) => {

    const storyId = context.params.postId;
    const uid = context.auth.uid || null;
    const comment = snap.val();
    const commentsCount = snap.numChildren();

    console.log(storyId, comment);

    // add to notifications list
    return admin.database().ref('/users/' + uid).once('value').then(function(snapshot) {
        var userID = snapshot.key;
        var user = snapshot.val();

        return admin.database().ref('/posts/' + storyId).once('value').then(function(snapPost) {
            // get story val
            var story = snapPost.val();
            var message = "<b>" + comment.profile_name + "</b>" +  comment.message;

            // send push notification to user channel
            var payload = {
                notification: {
                    title: story.user + " comment your story",
                    body: "",
                },
                topic: '/topics/feed' + story.key
            };

            admin.messaging().send(payload)

            // update count and last message
            return snapPost.ref.update({
                message: message,
                comments: commentsCount
            });
        });
    });
});

exports.onLikes = functions.database.ref('/likes/{postId}')
    .onWrite((change, context) => {

    const storyId = context.params.postId;
    const uid = context.auth.uid || null;
    const before = change.before;
    const after = change.after;
    const likesCount = change.after.numChildren();

    // get the user of that post
    return admin.database().ref('/posts/' + storyId).once('value').then(function(snap_post) {

        // update post likes count
        var post = snap_post.val();
        snap_post.ref.child("likes").set(likesCount);

        // update user total likes
        var userId = post["user"];

        return admin.database().ref('/users/' + userId + '/liked').once('value').then(function(snap_likes) {            
            var count = snap_likes.val() || 0;

            // it's created. so liked
            if (before.exists()) {
                snap_likes.ref.set(count + 1); // +1 score
            }

            // it's deleted. so disliked
            if (!after.exists()) {
                snap_likes.ref.set(count - 1); // -1 score
            }
        });
    });
});

exports.onMessage = functions.database.ref('messages/{chatId}/{messageId}')
    .onCreate((snap, context) => {

    const uid = context.auth.uid || null;
    const message = snap.val();
    const messageId = context.params.chatId;
    const chatId = context.params.chatId;

    console.log("New message for :", chatId, message);

    // get chat
    admin.database().ref("chats").child(message["user_id"]).child(chatId).once('value').then(function(chat) {        
        var contactId = chat.val().contact;

        // update contact total unread counter
        admin.database().ref('users').child(contactId).once('value').then(function(contact) {
            var unread = contact.val()["unread"] | 0  
            unread = unread + 1;
            // increment unter
            contact.ref.update({ unread: unread });
        });

        // update contact chat unread counter
        admin.database().ref("chats").child(contactId).child(chatId).once('value').then(function(chat2) {
            var unread = chat2.val()["unread"] | 0  
            unread = unread + 1;
            // increment counter
            chat2.ref.update({ unread: unread });
        });
    });

    var payload = {
        notification: {
            title: "New story posted",
            body: message.message
        },
        topic: 'chat' + message.user_id
    };

    console.log(payload);

    return admin.messaging().send(payload);
});
