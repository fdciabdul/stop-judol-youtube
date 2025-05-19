import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuth2Client, loadToken } from './oauth2';

loadToken();

export default class YouTubeCommentModerator {
    private readonly youtube: youtube_v3.Youtube;
    private readonly videoId: string;
    private readonly blockedWords: string[];

    constructor(authClient: OAuth2Client, videoId: string, blockedWords: string[]) {
        this.youtube = google.youtube({ version: 'v3', auth: authClient });
        this.videoId = videoId;
        this.blockedWords = blockedWords;
    }

    
    public async listComments(): Promise<{ id: string; text: string }[]> {
        try {
            const response:any = await this.youtube.commentThreads.list({
                part: ['snippet', 'replies'],
                videoId: this.videoId,
                maxResults: 50,
            });

            if (!response.data.items) return [];

            const comments:any = [];

            for (const item of response.data.items) {
                const topComment = item.snippet?.topLevelComment?.snippet;
                if (topComment) {
                    comments.push({
                        id: item.snippet?.topLevelComment?.id || item.id!,
                        text: topComment.textDisplay,
                    });
                }

                if (item.replies?.comments) {
                    for (const reply of item.replies.comments) {
                        comments.push({
                            id: reply.id,
                            text: reply.snippet.textDisplay,
                        });
                    }
                }
            }

            console.log('✅ Fetched comments:', comments);
            return comments;
        } catch (error) {
            console.error('❌ Error fetching comments:', error);
            return [];
        }
    }

    private async moderateComment(commentId: string) {
        try {
            await this.youtube.comments.setModerationStatus({
                id: [commentId], 
                moderationStatus: 'rejected', 
                banAuthor: false, 
            });
            console.log(`🚫 Rejected comment: ${commentId}`);
        } catch (error: any) {
            console.error(`❌ Failed to reject comment: ${commentId}`);
            if (error.response) {
                console.error('Full API Response:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error);
            }
        }
    }
    

  
    public async moderateComments(): Promise<void> {
        const comments = await this.listComments();

        for (const comment of comments) {
            if (this.blockedWords.some(word => comment.text.toLowerCase().includes(word))) {
                console.log(`🚫 Hiding comment: "${comment.text}"`);
                await this.moderateComment(comment.id);
                await this.delay(1000); 
            }
        }
    }

  
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}



