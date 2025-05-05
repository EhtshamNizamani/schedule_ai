// ChatProvider.dart
import 'package:flutter/material.dart';
import 'package:frontend/app/model/chat_message.dart';
import 'package:frontend/app/service/chat_service.dart';

class ChatProvider with ChangeNotifier {
  final List<ChatMessage> _messages = [];
  final _service = ChatService();
  final String _userId = "user_${DateTime.now().millisecondsSinceEpoch}"; // Simple unique ID for testing

  List<ChatMessage> get messages => _messages;

  Future<void> sendMessage(String message) async {
    // Add user message immediately
    _messages.add(ChatMessage(text: message, isUser: true));
    notifyListeners();

    try {
      // Call the backend service
      final response = await _service.sendMessage(message, _userId);

      // Extract reply and stage from backend response
      final String? backendReply = response['reply'];
      final String? backendStage = response['stage'];

      print("Backend Response - Reply: $backendReply, Stage: $backendStage");

      if (backendReply != null && backendReply.isNotEmpty) {
        // Add the backend's reply (question or confirmation or final message)
        _messages.add(ChatMessage(text: backendReply, isUser: false));
      } else {
        // If reply is empty or null, add a generic error (shouldn't happen ideally)
        print("Warning: Backend returned empty or null reply.");
        _messages.add(ChatMessage(text: "Received an empty response.", isUser: false));
      }

      // Optional: You could use the 'stage' for further frontend logic if needed
      if (backendStage == 'DONE' || backendStage == 'CONFIRM') {
         // Maybe change UI state, disable input etc.
         print("Conversation reached stage: $backendStage");
      }

    } catch (e) {
      // Handle exceptions from the service call (network error, backend 500 error etc.)
      print("Error calling backend service: $e");
      _messages.add(ChatMessage(text: "Sorry, something went wrong connecting to the server.", isUser: false));
    } finally {
      // Always notify listeners to update the UI
      notifyListeners();
    }
  }
}