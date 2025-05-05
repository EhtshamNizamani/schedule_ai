import 'package:flutter/material.dart';
import 'package:frontend/app/chat/provider.dart';
import 'package:provider/provider.dart';

import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:url_launcher/url_launcher.dart';

class ChatScreen extends StatelessWidget {
  final TextEditingController _controller = TextEditingController();

  // --- Helper function to launch URLs ---
  Future<void> _launchURL(Uri url) async {
    // Check if the URL can be launched (good practice)
    if (await canLaunchUrl(url)) {
      // Try launching the URL
      bool launched = await launchUrl(
        url,
        mode: LaunchMode.externalApplication,
      ); // Open externally
      if (!launched) {
        print('Could not launch $url');
        // Optionally show a snackbar or message to the user
      }
    } else {
      print('Could not launch $url');
      // Optionally show a snackbar or message to the user
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatProvider = Provider.of<ChatProvider>(context);

    return Scaffold(
      appBar: AppBar(title: Text('AI Calendar Assistant')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: chatProvider.messages.length,
              reverse: true,
              itemBuilder: (_, index) {
                // Access messages in reverse for display order
                final msg =
                    chatProvider.messages[chatProvider.messages.length -
                        1 -
                        index];
                return Container(
                  alignment:
                      msg.isUser ? Alignment.centerRight : Alignment.centerLeft,
                  padding: EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                  child: Container(
                    decoration: BoxDecoration(
                      color: msg.isUser ? Colors.blue[100] : Colors.grey[200],
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: EdgeInsets.all(12),
                    child: SelectableRegion(
                      // <-- Wrap the bubble
                      focusNode: FocusNode(), // Required
                      selectionControls:
                          MaterialTextSelectionControls(), // Use default controls
                      child: Container(
                        // Your existing message bubble container
                        decoration: BoxDecoration(
                          color:
                              msg.isUser ? Colors.blue[100] : Colors.grey[200],
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: EdgeInsets.symmetric(horizontal:6,vertical: 0),
                        child: Linkify(
                          // Use normal Linkify inside
                          onOpen: (link) async {
                            final Uri urlToLaunch = Uri.parse(link.url);
                            await _launchURL(urlToLaunch);
                          },
                          text: msg.text,
                     
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          Divider(),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: InputDecoration(hintText: "Write something..."),
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.send),
                  onPressed: () {
                    final text = _controller.text.trim();
                    if (text.isNotEmpty) {
                      chatProvider.sendMessage(text);
                      _controller.clear();
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
